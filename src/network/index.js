import Peer from "peerjs";
import { state } from "../state.js";
import { PLAYER_SPAWN_Y, LAYER_MOVING } from "../constants.js";
import { updatePlayer } from "../game/player.js";
import { showVictory } from "../ui/victory.js";
import { applyRemoteEffect, vanishObject } from "../game/projectiles.js";
import { createRemotePlayerBody } from "../physics/world.js";
import { setWorldSeed } from "../physics/worldRandom.js";
import { rebuildWorldObjects } from "../game/objectCount.js";
import {
  addRemotePlayerVisual,
  removeRemotePlayerVisual,
  updateRemotePlayerVisual,
} from "../graphics/remotePlayers.js";

const DEFAULT_NAME = "Игрок";
const OBJECT_SYNC_INTERVAL = 0.1;
const MAX_ACTIVE_OBJECTS = 220;
const IDLE_OBJECT_BATCH = 80;
const OBJECT_VELOCITY_EPS = 0.05;

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

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
    state.multiplayer.error = "Соединение с хостом потеряно";
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

function collectRemovedKeys() {
  const keys = [];
  for (const object of state.objects) {
    if (object.exploded || object.absorbed) keys.push(object.key);
  }
  return keys;
}

function buildWorldMessage() {
  return {
    type: "world",
    seed: state.worldSeed,
    total: state.totalObjects,
    spawnMode: state.spawnMode,
    removedKeys: collectRemovedKeys(),
  };
}

function applyWorld(data) {
  if (!data) return;
  if (typeof data.seed === "number") {
    state.worldSeed = data.seed >>> 0;
    setWorldSeed(state.worldSeed);
  }
  if (data.spawnMode) state.spawnMode = data.spawnMode;
  const total = Number(data.total) || state.totalObjects;
  rebuildWorldObjects(total);
  if (Array.isArray(data.removedKeys)) {
    for (const key of data.removedKeys) {
      const object = state.objectByKey.get(key);
      if (object && !object.exploded && !object.absorbed) {
        vanishObject(object, object.position.x, object.position.y, object.position.z, true);
      }
    }
  }
  state.removedShown = -1;
  state.multiplayer.worldReady = true;
}

function encodeObject(object) {
  const p = object.body.GetPosition();
  const x = p.GetX();
  const y = p.GetY();
  const z = p.GetZ();
  const q = object.body.GetRotation();
  const qx = q.GetX();
  const qy = q.GetY();
  const qz = q.GetZ();
  const qw = q.GetW();
  const v = state.bodyInterface.GetLinearVelocity(object.id);
  const vx = v.GetX();
  const vy = v.GetY();
  const vz = v.GetZ();
  const w = state.bodyInterface.GetAngularVelocity(object.id);
  const wx = w.GetX();
  const wy = w.GetY();
  const wz = w.GetZ();
  return [
    object.key,
    round2(x), round2(y), round2(z),
    round3(qx), round3(qy), round3(qz), round3(qw),
    round2(vx), round2(vy), round2(vz),
    round2(wx), round2(wy), round2(wz),
  ];
}

function collectSyncObjectStates() {
  const objects = state.objects;
  if (!objects.length) return [];

  const active = [];
  for (const object of objects) {
    if (object.exploded || object.absorbed) continue;
    if (object.body.IsActive()) active.push(object);
  }

  let selected = active;
  if (active.length > MAX_ACTIVE_OBJECTS) {
    const start = (state.multiplayer.activeCursor || 0) % active.length;
    selected = active.slice(start, start + MAX_ACTIVE_OBJECTS);
    if (selected.length < MAX_ACTIVE_OBJECTS) {
      selected = selected.concat(active.slice(0, MAX_ACTIVE_OBJECTS - selected.length));
    }
    state.multiplayer.activeCursor = (start + MAX_ACTIVE_OBJECTS) % active.length;
  } else {
    state.multiplayer.activeCursor = 0;
  }

  const idle = [];
  let cursor = state.multiplayer.idleCursor || 0;
  let scanned = 0;
  while (idle.length < IDLE_OBJECT_BATCH && scanned < objects.length) {
    const object = objects[cursor % objects.length];
    cursor++;
    scanned++;
    if (object.exploded || object.absorbed) continue;
    if (object.body.IsActive()) continue;
    if (object === state.held) continue;
    idle.push(object);
  }
  state.multiplayer.idleCursor = cursor % objects.length;

  return selected.concat(idle);
}

function collectRemovedDelta() {
  const keys = [];
  for (const object of state.objects) {
    if (object.exploded || object.absorbed) {
      if (!object.syncRemovedSent) {
        object.syncRemovedSent = true;
        keys.push(object.key);
      }
    } else if (object.syncRemovedSent) {
      object.syncRemovedSent = false;
    }
  }
  return keys;
}

function broadcastObjectSync() {
  const objects = collectSyncObjectStates();
  const removed = collectRemovedDelta();
  if (!objects.length && !removed.length) return;
  broadcast({
    type: "objects",
    objects: objects.map(encodeObject),
    removed,
  });
}

function applyObjectSync(data) {
  if (!data) return;
  if (!state.multiplayer.worldReady) return;
  const J = state.J;
  if (Array.isArray(data.removed)) {
    for (const key of data.removed) {
      const object = state.objectByKey.get(key);
      if (object && !object.exploded && !object.absorbed) {
        vanishObject(object, object.position.x, object.position.y, object.position.z, true);
      }
    }
  }
  if (!Array.isArray(data.objects)) return;
  for (const row of data.objects) {
    if (!Array.isArray(row) || row.length < 14) continue;
    const object = state.objectByKey.get(row[0]);
    if (!object) continue;
    if (object === state.held) continue;
    if (object.exploded || object.absorbed) {
      if (object.grownShape) continue;
      if (!object.body.IsInBroadPhase()) {
        state.bodyInterface.AddBody(object.id, J.EActivation_DontActivate);
      }
      object.exploded = false;
      object.absorbed = false;
      object.portalFall = false;
      state.bodyInterface.SetObjectLayer(object.id, LAYER_MOVING);
    }
    const x = row[1], y = row[2], z = row[3];
    const qx = row[4], qy = row[5], qz = row[6], qw = row[7];
    const vx = row[8], vy = row[9], vz = row[10];
    const wx = row[11], wy = row[12], wz = row[13];
    state.tmpRVec3.Set(x, y, z);
    state.tmpQuat.Set(qx, qy, qz, qw);
    object.position.set(x, y, z);
    object.quaternion.set(qx, qy, qz, qw);
    const moving =
      Math.abs(vx) > OBJECT_VELOCITY_EPS ||
      Math.abs(vy) > OBJECT_VELOCITY_EPS ||
      Math.abs(vz) > OBJECT_VELOCITY_EPS ||
      Math.abs(wx) > OBJECT_VELOCITY_EPS ||
      Math.abs(wy) > OBJECT_VELOCITY_EPS ||
      Math.abs(wz) > OBJECT_VELOCITY_EPS;
    if (moving) {
      state.tmpVec3.Set(vx, vy, vz);
      state.tmpVec3b.Set(wx, wy, wz);
      state.bodyInterface.SetPositionRotationAndVelocity(
        object.id,
        state.tmpRVec3,
        state.tmpQuat,
        state.tmpVec3,
        state.tmpVec3b
      );
      state.bodyInterface.ActivateBody(object.id);
    } else {
      state.bodyInterface.SetPositionAndRotation(
        object.id,
        state.tmpRVec3,
        state.tmpQuat,
        J.EActivation_DontActivate
      );
      state.bodyInterface.SetLinearAndAngularVelocity(
        object.id,
        state.zeroVec3,
        state.zeroVec3
      );
      state.bodyInterface.DeactivateBody(object.id);
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
  state.multiplayer.localName = name || DEFAULT_NAME;
  state.multiplayer.error = null;
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
    state.multiplayer.lastWorldTotal = state.totalObjects;
    state.multiplayer.lastWorldSpawnMode = state.spawnMode;
    state.multiplayer.lastLevelStart = state.levelStartTime;
    state.multiplayer.worldReady = true;
  });
  peer.on("connection", (conn) => setupConnection(conn, true));
  peer.on("error", (err) => {
    state.multiplayer.error = err && err.message ? err.message : "Ошибка сети";
  });
}

export function joinRoom(roomId, name) {
  const room = String(roomId || "").trim();
  if (!room) {
    state.multiplayer.error = "Введите код комнаты";
    return false;
  }
  leaveRoom();
  state.multiplayer.localName = name || DEFAULT_NAME;
  state.multiplayer.error = null;
  state.multiplayer.roomId = room;
  state.multiplayer.role = "client";
  state.multiplayer.worldReady = false;
  const peer = new Peer();
  state.multiplayer.peer = peer;
  peer.on("open", (id) => {
    state.multiplayer.peerId = id;
    const conn = peer.connect(room);
    setupConnection(conn, false);
  });
  peer.on("connection", (conn) => setupConnection(conn, true));
  peer.on("error", (err) => {
    state.multiplayer.connected = false;
    state.multiplayer.error = err && err.message ? err.message : "Ошибка сети";
  });
  return true;
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
    held: state.held ? state.held.type : null,
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
      players.push({ id: peerId, x, y, z, yaw, pitch, facing, vx, vy, vz, held: null });
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
      broadcastObjectSync();
    }
    const worldChanged =
      state.multiplayer.lastWorldTotal !== state.totalObjects ||
      state.multiplayer.lastWorldSpawnMode !== state.spawnMode ||
      state.multiplayer.lastLevelStart !== state.levelStartTime;
    if (worldChanged) {
      state.multiplayer.lastWorldTotal = state.totalObjects;
      state.multiplayer.lastWorldSpawnMode = state.spawnMode;
      state.multiplayer.lastLevelStart = state.levelStartTime;
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


