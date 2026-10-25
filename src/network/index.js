import Peer from "peerjs";
import { state } from "../state.js";
import { PLAYER_SPAWN_Y } from "../constants.js";
import {
  handlePeerError,
  attachPeerReconnect,
  armPeerTimeout,
  connectToHost,
  startReconnectWatcher,
} from "./reconnect.js";
import {
  releaseRemoteHeldObject,
  releaseAllRemoteHeld,
  clearRemoteHeld,
  syncRemoteHeld,
} from "./remoteHeld.js";
import { updatePlayer, updateHeld } from "../game/player.js";
import { showVictory } from "../ui/victory.js";
import { applyRemoteEffect, vanishObject } from "../game/projectiles.js";
import { createRemotePlayerBody } from "../physics/world.js";
import {
  startManualHost,
  startManualGuest,
  applyManualAnswer,
  readManualToken,
} from "./manual.js";
import {
  addRemotePlayerVisual,
  removeRemotePlayerVisual,
  updateRemotePlayerVisual,
} from "../graphics/remotePlayers.js";
import {
  OBJECT_SYNC_INTERVAL,
  buildWorldMessage,
  applyWorld,
  applyObjectSync,
  createObjectSyncMessage,
} from "./objectSync.js";
import {
  loadPeerConfig,
  savePeerConfig,
  peerOptions,
  addPeerConfigToUrl,
  readPeerConfigFromParams,
} from "./peerConfig.js";

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
    state.multiplayer.error = null;
    state.multiplayer.clientConnectPending = false;
    state.multiplayer.hostConnectAttempts = 0;
    if (!hostSide) {
      conn.send({ type: "hello", name: state.multiplayer.localName || DEFAULT_NAME });
    }
  });

  conn.on("data", (data) => {
    handleMessage(conn.peer, data);
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

startReconnectWatcher(setupConnection);

function handleMessage(from, data) {
  if (!data || typeof data !== "object") return;
  switch (data.type) {
    case "hello":
      if (state.multiplayer.role === "host") {
        registerPeer(from, data.name || DEFAULT_NAME);
        if (!state.multiplayer.remoteBodies.has(from)) {
          const body = createRemotePlayerBody();
          state.multiplayer.remoteBodies.set(from, body);
          state.multiplayer.remoteBodyIds.set(from, body.GetID());
          state.multiplayer.inputs.set(from, null);
        }
        const conn = state.multiplayer.connections.get(from);
        if (conn) {
          try { conn.send(buildWorldMessage()); } catch (e) {}
        }
        broadcast({ type: "peer-list", peers: state.multiplayer.peers });
      }
      break;
    case "peer-list":
      state.multiplayer.peers = data.peers || [];
      syncRemoteVisuals();
      break;
    case "world":
      if (state.multiplayer.role !== "host") applyWorld(data);
      break;
    case "objects":
      if (state.multiplayer.role !== "host") applyObjectSync(data);
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
          if (data.objectKey) {
            const object = state.objectByKey.get(data.objectKey);
            if (object && !object.exploded && !object.absorbed) {
              vanishObject(object, object.position.x, object.position.y, object.position.z);
            }
          }
          applyRemoteEffect(data);
          broadcastExcept(data.from, data);
        } else {
          applyRemoteEffect(data);
        }
      }
      break;
    case "victory":
      triggerVictory();
      break;
  }
}

function registerPeer(peerId, name) {
  const existing = state.multiplayer.peers.find((p) => p.id === peerId);
  if (existing) existing.name = name;
  else state.multiplayer.peers.push({ id: peerId, name, isHost: false });
  addRemotePlayerVisual(peerId);
}

function removePeer(peerId) {
  releaseRemoteHeldObject(peerId);
  state.multiplayer.peers = state.multiplayer.peers.filter((p) => p.id !== peerId);
  removeRemotePlayerVisual(peerId);
  if (state.multiplayer.remoteBodies) {
    const body = state.multiplayer.remoteBodies.get(peerId);
    if (body) {
      try {
        const id = body.GetID();
        if (body.IsInBroadPhase()) state.bodyInterface.RemoveBody(id);
        state.bodyInterface.DestroyBody(id);
      } catch (e) {}
    }
    state.multiplayer.remoteBodies.delete(peerId);
    state.multiplayer.remoteBodyIds.delete(peerId);
    state.multiplayer.inputs.delete(peerId);
  }
  if (state.multiplayer.role === "host") {
    broadcast({ type: "peer-list", peers: state.multiplayer.peers });
  } else if (state.multiplayer.role === "client" && state.multiplayer.connections.size === 0) {
    state.multiplayer.connected = false;
    state.multiplayer.clientConnectPending = false;
    if (state.multiplayer.mode === "peerjs") {
      state.multiplayer.error = "Соединение с хостом потеряно. Переподключение…";
      setTimeout(ensureConnectivity, 500);
    } else {
      state.multiplayer.error = "Соединение с хостом потеряно";
    }
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
  const p = state.playerBody.GetPosition();
  const dx = player.x - p.GetX();
  const dy = player.y - p.GetY();
  const dz = player.z - p.GetZ();
  if (Math.hypot(dx, dy, dz) > 2.5) {
    const J = state.J;
    state.tmpRVec3.Set(player.x, player.y, player.z);
    state.tmpQuat.Set(0, 0, Math.sin(player.yaw * 0.5), Math.cos(player.yaw * 0.5));
    state.bodyInterface.SetPositionAndRotation(state.playerId, state.tmpRVec3, state.tmpQuat, J.EActivation_Activate);
  }
}

function triggerVictory() {
  if (state.victory) return;
  state.victory = true;
  state.paused = true;
  try { showVictory(); } catch (e) {}
}

export function createRoom(name) {
  leaveRoom();
  state.multiplayer.mode = "peerjs";
  state.multiplayer.localName = name || DEFAULT_NAME;
  state.multiplayer.error = null;
  const peer = new Peer(peerOptions(loadPeerConfig()));
  state.multiplayer.peer = peer;
  peer.on("open", (id) => {
    if (state.multiplayer.peer !== peer) return;
    const previousId = state.multiplayer.roomId;
    state.multiplayer.role = "host";
    state.multiplayer.roomId = id;
    state.multiplayer.peerId = id;
    state.multiplayer.connected = true;
    state.multiplayer.error = null;
    if (!state.multiplayer.remoteBodies) {
      state.multiplayer.peers = [{ id, name: state.multiplayer.localName, isHost: true }];
      state.multiplayer.remoteBodies = new Map();
      state.multiplayer.remoteBodyIds = new Map();
      state.multiplayer.remoteHeld = new Map();
      state.multiplayer.inputs = new Map();
      state.multiplayer.lastWorldTotal = state.totalObjects;
      state.multiplayer.lastWorldSpawnMode = state.spawnMode;
      state.multiplayer.lastLevelStart = state.levelStartTime;
      state.multiplayer.worldReady = true;
    } else {
      const hostPeer = state.multiplayer.peers.find((p) => p.isHost);
      if (hostPeer) {
        hostPeer.id = id;
        hostPeer.name = state.multiplayer.localName;
      } else {
        state.multiplayer.peers.unshift({
          id,
          name: state.multiplayer.localName,
          isHost: true,
        });
      }
    }
    if (previousId && previousId !== id) {
      broadcast({ type: "peer-list", peers: state.multiplayer.peers });
    }
  });
  peer.on("connection", (conn) => {
    if (state.multiplayer.peer !== peer) return;
    setupConnection(conn, true);
  });
  peer.on("error", (err) => {
    if (state.multiplayer.peer !== peer) return;
    handlePeerError(err);
  });
  attachPeerReconnect(peer);
  armPeerTimeout(peer);
}

export function joinRoom(roomId, name) {
  const room = String(roomId || "").trim();
  if (!room) {
    state.multiplayer.error = "Введите код комнаты";
    return false;
  }
  leaveRoom();
  state.multiplayer.mode = "peerjs";
  state.multiplayer.localName = name || DEFAULT_NAME;
  state.multiplayer.error = null;
  state.multiplayer.roomId = room;
  state.multiplayer.role = "client";
  state.multiplayer.worldReady = false;
  const peer = new Peer(peerOptions(loadPeerConfig()));
  state.multiplayer.peer = peer;
  peer.on("open", (id) => {
    if (state.multiplayer.peer !== peer) return;
    state.multiplayer.peerId = id;
    state.multiplayer.error = null;
    state.multiplayer.hostConnectAttempts = 0;
    connectToHost(peer, room, setupConnection);
  });
  peer.on("connection", (conn) => {
    if (state.multiplayer.peer !== peer) return;
    setupConnection(conn, true);
  });
  peer.on("error", (err) => {
    if (state.multiplayer.peer !== peer) return;
    handlePeerError(err);
  });
  attachPeerReconnect(peer);
  armPeerTimeout(peer);
  return true;
}

export async function createManualRoom(name) {
  leaveRoom();
  state.multiplayer.error = null;
  try {
    return await startManualHost(name, setupConnection);
  } catch (e) {
    state.multiplayer.error = e && e.message ? e.message : "Не удалось создать ссылку";
    return "";
  }
}

export async function joinManualRoom(value, name) {
  const token = readManualToken(value);
  if (!token) {
    state.multiplayer.error = "Вставьте ссылку или код приглашения";
    return false;
  }
  leaveRoom();
  state.multiplayer.error = null;
  try {
    await startManualGuest(token, name, setupConnection);
    return true;
  } catch (e) {
    state.multiplayer.error = e && e.message ? e.message : "Не удалось принять приглашение";
    return false;
  }
}

export async function applyManualAnswerToken(value) {
  const token = readManualToken(value);
  if (!token) {
    state.multiplayer.error = "Вставьте код ответа";
    return false;
  }
  if (!state.multiplayer.manualPc) {
    state.multiplayer.error = "Сначала создайте ссылку";
    return false;
  }
  try {
    await applyManualAnswer(state.multiplayer.manualPc, token);
    state.multiplayer.error = null;
    return true;
  } catch (e) {
    state.multiplayer.error = e && e.message ? e.message : "Неверный код ответа";
    return false;
  }
}

export function getRoomLink(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  addPeerConfigToUrl(url, loadPeerConfig());
  return url.toString();
}

export async function autoJoinFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const name = localStorage.getItem("mp_name") || "Игрок";
  const manual = params.get("manual");
  if (manual) {
    await joinManualRoom(manual, name);
    return true;
  }
  const room = params.get("room");
  if (!room) return false;
  const peerConfig = readPeerConfigFromParams(params);
  if (peerConfig) savePeerConfig(peerConfig);
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
  if (state.multiplayer.manualPc) {
    try { state.multiplayer.manualPc.close(); } catch (e) {}
  }
  releaseAllRemoteHeld();
  if (state.multiplayer.remoteBodies) {
    for (const body of state.multiplayer.remoteBodies.values()) {
      try {
        const id = body.GetID();
        if (body.IsInBroadPhase()) state.bodyInterface.RemoveBody(id);
        state.bodyInterface.DestroyBody(id);
      } catch (e) {}
    }
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
  state.multiplayer.remoteHeld = null;
  state.multiplayer.inputs = null;
  state.multiplayer.snapshotAccumulator = 0;
  state.multiplayer.inputAccumulator = 0;
  state.multiplayer.objectSyncAccumulator = 0;
  state.multiplayer.activeCursor = 0;
  state.multiplayer.idleCursor = 0;
  state.multiplayer.lastWorldTotal = 0;
  state.multiplayer.lastWorldSpawnMode = "";
  state.multiplayer.lastLevelStart = 0;
  state.multiplayer.worldReady = false;
  state.multiplayer.manualPc = null;
  state.multiplayer.manualLink = "";
  state.multiplayer.manualAnswer = "";
  state.multiplayer.peerReconnectAttempts = 0;
  state.multiplayer.lastPeerReconnectAt = 0;
  state.multiplayer.hostConnectAttempts = 0;
  state.multiplayer.lastHostConnectAt = 0;
  state.multiplayer.clientConnectPending = false;
  state.multiplayer.error = null;
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
    held: state.held ? { key: state.held.key, type: state.held.type } : null,
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
  const hx = hostPos.GetX();
  const hy = hostPos.GetY();
  const hz = hostPos.GetZ();
  const hostVel = state.bodyInterface.GetLinearVelocity(state.playerId);
  const hvx = hostVel.GetX();
  const hvy = hostVel.GetY();
  const hvz = hostVel.GetZ();
  players.push({
    id: state.multiplayer.peerId,
    x: hx,
    y: hy,
    z: hz,
    yaw: state.yaw,
    pitch: state.pitch,
    facing: state.facing,
    vx: hvx,
    vy: hvy,
    vz: hvz,
    held: state.held ? { key: state.held.key, type: state.held.type } : null,
  });
  if (state.multiplayer.remoteBodyIds) {
    for (const [peerId, bodyId] of state.multiplayer.remoteBodyIds.entries()) {
      let x = 0, y = PLAYER_SPAWN_Y, z = 0, yaw = 0, pitch = 0, vx = 0, vy = 0, vz = 0;
      try {
        const b = state.multiplayer.remoteBodies.get(peerId);
        const p = b.GetPosition();
        x = p.GetX(); y = p.GetY(); z = p.GetZ();
        const v = state.bodyInterface.GetLinearVelocity(bodyId);
        vx = v.GetX(); vy = v.GetY(); vz = v.GetZ();
      } catch (e) {}
      const input = state.multiplayer.inputs.get(peerId);
      if (input) {
        yaw = input.yaw ?? yaw;
        pitch = input.pitch ?? pitch;
      }
      const remote = state.multiplayer.remotePlayers.get(peerId);
      const facing = remote ? remote.targetYaw : yaw;
      const held = input && input.held ? input.held : null;
      players.push({ id: peerId, x, y, z, yaw, pitch, facing, vx, vy, vz, held });
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
    if (state.multiplayer.snapshotAccumulator >= 1 / 30) {
      state.multiplayer.snapshotAccumulator = 0;
      broadcastSnapshot();
    }
    state.multiplayer.objectSyncAccumulator = (state.multiplayer.objectSyncAccumulator || 0) + dt;
    if (state.multiplayer.objectSyncAccumulator >= OBJECT_SYNC_INTERVAL) {
      state.multiplayer.objectSyncAccumulator = 0;
      const objectMessage = createObjectSyncMessage();
      if (objectMessage) broadcast(objectMessage);
    }
    const worldChanged =
      state.multiplayer.lastWorldTotal !== state.totalObjects ||
      state.multiplayer.lastWorldSpawnMode !== state.spawnMode ||
      state.multiplayer.lastLevelStart !== state.levelStartTime;
    if (worldChanged) {
      state.multiplayer.lastWorldTotal = state.totalObjects;
      state.multiplayer.lastWorldSpawnMode = state.spawnMode;
      state.multiplayer.lastLevelStart = state.levelStartTime;
      clearRemoteHeld();
      broadcast(buildWorldMessage());
    }
  }
  if (state.multiplayer.role === "client") {
    state.multiplayer.inputAccumulator = (state.multiplayer.inputAccumulator || 0) + dt;
    if (state.multiplayer.inputAccumulator >= 1 / 30) {
      state.multiplayer.inputAccumulator = 0;
      sendInput();
    }
  }
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
    grounded: state.grounded,
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
    state.held = syncRemoteHeld(peerId, input.held, saved.held, body);
    try {
      updatePlayer(dt);
      if (state.held) updateHeld(dt, false);
    } catch (e) {}
  }
  state.keys = saved.keys;
  state.yaw = saved.yaw;
  state.pitch = saved.pitch;
  state.touchMove = saved.touchMove;
  state.touchRun = saved.touchRun;
  state.jumpQueued = saved.jumpQueued;
  state.grounded = saved.grounded;
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


