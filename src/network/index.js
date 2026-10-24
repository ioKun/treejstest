import Peer from "peerjs";
import { state } from "../state.js";
import { FIXED_DT } from "../constants.js";
import { updatePlayer } from "../game/player.js";
import { showVictory } from "../ui/victory.js";
import { applyRemoteEffect } from "../game/projectiles.js";
import { createRemotePlayerBody } from "../physics/world.js";
import { addRemotePlayerVisual, removeRemotePlayerVisual, updateRemotePlayerVisual } from "../graphics/remotePlayers.js";
import { PLAYER_SPAWN_Y } from "../constants.js";

const DEFAULT_NAME = "Игрок";

function broadcast(message) {
  for (const conn of state.multiplayer.connections.values()) {
    try {
      conn.send(message);
    } catch (e) {}
  }
}

function broadcastExcept(exceptId, message) {
  for (const [id, conn] of state.multiplayer.connections.entries()) {
    if (id === exceptId) continue;
    try {
      conn.send(message);
    } catch (e) {}
  }
}

function setupConnection(conn, hostSide) {
  conn.on("open", () => {
    state.multiplayer.connections.set(conn.peer, conn);
    state.multiplayer.connected = true;
    if (!hostSide) {
      conn.send({ type: "hello", name: state.multiplayer.localName || DEFAULT_NAME });
    }
  });

  conn.on("data", (data) => {
    handleMessage(conn.peer, data, hostSide);
  });

  conn.on("close", () => {
    state.multiplayer.connections.delete(conn.peer);
    removePeer(conn.peer);
  });

  conn.on("error", () => {
    state.multiplayer.connections.delete(conn.peer);
    removePeer(conn.peer);
  });
}

function handleMessage(from, data, hostSide) {
  if (!data || typeof data !== "object") return;
  switch (data.type) {
    case "hello":
      if (state.multiplayer.role === "host") {
        registerPeer(from, data.name || DEFAULT_NAME);
        const body = createRemotePlayerBody();
        state.multiplayer.remoteBodies.set(from, body);
        state.multiplayer.remoteBodyIds.set(from, body.GetID());
        state.multiplayer.inputs.set(from, null);
        broadcast({ type: "peer-list", peers: state.multiplayer.peers });
      }
      break;
    case "peer-list":
      state.multiplayer.peers = data.peers || [];
      syncRemoteVisuals();
      break;
    case "input":
      if (state.multiplayer.role === "host") {
        state.multiplayer.inputs.set(from, data);
      }
      break;
    case "snapshot":
      if (state.multiplayer.role !== "host") {
        applySnapshot(data);
      }
      break;
    case "event":
      if (data.eventType === "effect") {
        if (state.multiplayer.role === "host") {
          applyRemoteEffect(data);
          broadcastExcept(data.from, data);
        } else {
          applyRemoteEffect(data);
        }
      } else {
        applyEvent(data);
      }
      break;
    case "victory":
      triggerVictory();
      break;
  }
}

function registerPeer(peerId, name) {
  if (!state.multiplayer.peers.some((p) => p.id === peerId)) {
    state.multiplayer.peers.push({ id: peerId, name, isHost: false });
  }
  addRemotePlayerVisual(peerId);
}

function removePeer(peerId) {
  state.multiplayer.peers = state.multiplayer.peers.filter((p) => p.id !== peerId);
  removeRemotePlayerVisual(peerId);
  if (state.multiplayer.remoteBodies) {
    const body = state.multiplayer.remoteBodies.get(peerId);
    if (body) {
      try {
        state.bodyInterface.DestroyBody(body.GetID());
      } catch (e) {}
    }
    state.multiplayer.remoteBodies.delete(peerId);
    state.multiplayer.remoteBodyIds.delete(peerId);
    state.multiplayer.inputs.delete(peerId);
  }
  if (state.multiplayer.role === "host") {
    broadcast({ type: "peer-list", peers: state.multiplayer.peers });
  }
}

function syncRemoteVisuals() {
  for (const peer of state.multiplayer.peers) {
    if (peer.id === state.multiplayer.peerId) continue;
    addRemotePlayerVisual(peer.id);
  }
  for (const remote of [...state.multiplayer.remotePlayers.keys()]) {
    if (!state.multiplayer.peers.some((p) => p.id === remote) && remote !== state.multiplayer.peerId) {
      removeRemotePlayerVisual(remote);
    }
  }
}

function applySnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.players)) return;
  state.multiplayer.lastSnapshotTick = snapshot.tick || 0;
  if (typeof snapshot.removed === "number") {
    state.removed = snapshot.removed;
  }
  if (typeof snapshot.total === "number") {
    state.totalObjects = snapshot.total;
  }
  for (const player of snapshot.players) {
    if (player.id === state.multiplayer.peerId) {
      reconcileLocalPlayer(player);
      continue;
    }
    updateRemotePlayerVisual(player.id, player);
  }
}

function reconcileLocalPlayer(player) {
  if (!state.playerBody) return;
  const dx = player.x - (state.playerBody.GetPosition().GetX());
  const dy = player.y - (state.playerBody.GetPosition().GetY());
  const dz = player.z - (state.playerBody.GetPosition().GetZ());
  if (Math.hypot(dx, dy, dz) > 2.5) {
    const J = state.J;
    state.tmpRVec3.Set(player.x, player.y, player.z);
    state.tmpQuat.Set(0, 0, Math.sin(player.yaw * 0.5), Math.cos(player.yaw * 0.5));
    state.bodyInterface.SetPositionAndRotation(state.playerId, state.tmpRVec3, state.tmpQuat, J.EActivation_Activate);
  }
  state.yaw = player.yaw ?? state.yaw;
  state.pitch = player.pitch ?? state.pitch;
}

function applyEvent(event) {
  if (!event) return;
  if (event.type === "victory") triggerVictory();
}

function triggerVictory() {
  if (state.victory) return;
  state.victory = true;
  state.paused = true;
  try { showVictory(); } catch (e) {}
}

export function createRoom(name) {
  state.multiplayer.localName = name || DEFAULT_NAME;
  const peer = new Peer();
  state.multiplayer.peer = peer;
  peer.on("open", (id) => {
    state.multiplayer.role = "host";
    state.multiplayer.roomId = id;
    state.multiplayer.peerId = id;
    state.multiplayer.connected = true;
    state.multiplayer.peers = [{ id, name: state.multiplayer.localName, isHost: true }];
    state.multiplayer.remoteBodies = new Map();
    state.multiplayer.remoteBodyIds = new Map();
    state.multiplayer.inputs = new Map();
    addRemotePlayerVisual(id);
    try { updateMultiplayerStatus(); } catch (e) {}
  });
  peer.on("connection", (conn) => setupConnection(conn, true));
  peer.on("error", () => {});
}

export function joinRoom(roomId, name) {
  state.multiplayer.localName = name || DEFAULT_NAME;
  const peer = new Peer();
  state.multiplayer.peer = peer;
  state.multiplayer.roomId = roomId;
  peer.on("open", (id) => {
    state.multiplayer.peerId = id;
    state.multiplayer.role = "client";
    const conn = peer.connect(roomId);
    setupConnection(conn, false);
  });
  peer.on("connection", (conn) => setupConnection(conn, true));
  peer.on("error", () => {});
}

export function getRoomLink(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

export function autoJoinFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  if (!room) return false;
  const name = localStorage.getItem("mp_name") || "Игрок";
  joinRoom(room, name);
  return true;
}

export function leaveRoom() {
  try {
    for (const conn of state.multiplayer.connections.values()) conn.close();
  } catch (e) {}
  if (state.multiplayer.peer) {
    try { state.multiplayer.peer.destroy(); } catch (e) {}
  }
  for (const peerId of [...state.multiplayer.remotePlayers.keys()]) removeRemotePlayerVisual(peerId);
  state.multiplayer.role = "none";
  state.multiplayer.roomId = null;
  state.multiplayer.peerId = null;
  state.multiplayer.connected = false;
  state.multiplayer.peer = null;
  state.multiplayer.connections.clear();
  state.multiplayer.peers = [];
  state.multiplayer.remoteBodies = null;
  state.multiplayer.remoteBodyIds = null;
  state.multiplayer.inputs = null;
}

export function collectInput() {
  const keys = [];
  for (const k of state.keys) keys.push(k);
  return {
    type: "input",
    seq: ++state.multiplayer.inputSeq,
    keys,
    yaw: state.yaw,
    pitch: state.pitch,
    touchMove: state.touchMove,
    touchRun: state.touchRun,
    jumpQueued: state.jumpQueued,
    grab: false,
    throw: false,
    drop: false,
  };
}

export function sendInput() {
  if (state.multiplayer.role !== "client" || !state.multiplayer.connected) return;
  const msg = collectInput();
  for (const conn of state.multiplayer.connections.values()) {
    try { conn.send(msg); } catch (e) {}
  }
}

export function broadcastSnapshot() {
  if (state.multiplayer.role !== "host" || !state.multiplayer.connected) return;
  const players = [];
  const hostPos = state.playerBody.GetPosition();
  const hostVel = state.bodyInterface.GetLinearVelocity(state.playerId);
  players.push({
    id: state.multiplayer.peerId,
    x: hostPos.GetX(),
    y: hostPos.GetY(),
    z: hostPos.GetZ(),
    yaw: state.yaw,
    pitch: state.pitch,
    vx: hostVel.GetX(),
    vy: hostVel.GetY(),
    vz: hostVel.GetZ(),
    held: state.held ? state.held.type : null,
  });
  if (state.multiplayer.remoteBodyIds) {
    for (const [peerId, bodyId] of state.multiplayer.remoteBodyIds.entries()) {
      const body = state.bodyInterface ? null : null;
      let x = 0, y = PLAYER_SPAWN_Y, z = 0, yaw = 0, pitch = 0, vx = 0, vy = 0, vz = 0;
      try {
        const b = state.multiplayer.remoteBodies.get(peerId);
        const p = b.GetPosition();
        const v = state.bodyInterface.GetLinearVelocity(bodyId);
        x = p.GetX(); y = p.GetY(); z = p.GetZ();
        vx = v.GetX(); vy = v.GetY(); vz = v.GetZ();
      } catch (e) {}
      const input = state.multiplayer.inputs.get(peerId);
      if (input) {
        yaw = input.yaw ?? yaw;
        pitch = input.pitch ?? pitch;
      }
      players.push({ id: peerId, x, y, z, yaw, pitch, vx, vy, vz, held: null });
    }
  }
  const snapshot = {
    type: "snapshot",
    tick: Date.now(),
    players,
    removed: state.removed,
    total: state.totalObjects,
  };
  broadcast(snapshot);
}

export function updateNetwork(dt) {
  if (state.multiplayer.role === "host") {
    state.multiplayer.snapshotAccumulator = (state.multiplayer.snapshotAccumulator || 0) + dt;
    if (state.multiplayer.snapshotAccumulator >= 0.05) {
      state.multiplayer.snapshotAccumulator = 0;
      broadcastSnapshot();
    }
  }
  if (state.multiplayer.role === "client") {
    sendInput();
  }
  updateMultiplayerStatus();
}

export function updateRemotePlayers(dt) {
  if (state.multiplayer.role !== "host" || !state.multiplayer.inputs) return;
  const saved = {
    keys: state.keys,
    yaw: state.yaw,
    pitch: state.pitch,
    touchMove: state.touchMove,
    touchRun: state.touchRun,
    jumpQueued: state.jumpQueued,
    playerBody: state.playerBody,
    playerId: state.playerId,
    held: state.held,
  };
  for (const [peerId, input] of state.multiplayer.inputs.entries()) {
    if (!input) continue;
    const body = state.multiplayer.remoteBodies.get(peerId);
    if (!body) continue;
    state.playerBody = body;
    state.playerId = body.GetID();
    state.keys = new Set(input.keys || []);
    state.yaw = input.yaw ?? state.yaw;
    state.pitch = input.pitch ?? state.pitch;
    state.touchMove = input.touchMove || { x: 0, y: 0 };
    state.touchRun = !!input.touchRun;
    state.jumpQueued = !!input.jumpQueued;
    state.held = null;
    try {
      updatePlayer(dt);
    } catch (e) {}
  }
  state.keys = saved.keys;
  state.yaw = saved.yaw;
  state.pitch = saved.pitch;
  state.touchMove = saved.touchMove;
  state.touchRun = saved.touchRun;
  state.jumpQueued = saved.jumpQueued;
  state.playerBody = saved.playerBody;
  state.playerId = saved.playerId;
  state.held = saved.held;
}

function applyRemoteInputs() {
  if (!state.multiplayer.inputs) return;
  const saved = {
    keys: new Set(state.keys),
    yaw: state.yaw,
    pitch: state.pitch,
    touchMove: { ...state.touchMove },
    touchRun: state.touchRun,
    jumpQueued: state.jumpQueued,
    playerBody: state.playerBody,
    playerId: state.playerId,
    held: state.held,
  };
  for (const [peerId, input] of state.multiplayer.inputs.entries()) {
    if (!input) continue;
    const body = state.multiplayer.remoteBodies.get(peerId);
    if (!body) continue;
    state.playerBody = body;
    state.playerId = body.GetID();
    state.keys = new Set(input.keys || []);
    state.yaw = input.yaw ?? state.yaw;
    state.pitch = input.pitch ?? state.pitch;
    state.touchMove = input.touchMove || { x: 0, y: 0 };
    state.touchRun = !!input.touchRun;
    state.jumpQueued = !!input.jumpQueued;
    state.held = null;
    try {
      updatePlayer(FIXED_DT);
    } catch (e) {}
  }
  state.keys = saved.keys;
  state.yaw = saved.yaw;
  state.pitch = saved.pitch;
  state.touchMove = saved.touchMove;
  state.touchRun = saved.touchRun;
  state.jumpQueued = saved.jumpQueued;
  state.playerBody = saved.playerBody;
  state.playerId = saved.playerId;
  state.held = saved.held;
}

export function broadcastVictory() {
  broadcast({ type: "victory" });
}

export function sendEvent(message) {
  if (!state.multiplayer || !state.multiplayer.connected) return;
  const msg = Object.assign({ type: "event" }, message);
  if (state.multiplayer.role === "host") {
    broadcast(msg);
  } else {
    const conn = [...state.multiplayer.connections.values()][0];
    if (conn) {
      try { conn.send(msg); } catch (e) {}
    }
  }
}

export function updateMultiplayerStatus() {
  // no-op placeholder; UI can read state
}

