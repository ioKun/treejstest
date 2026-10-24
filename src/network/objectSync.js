import { state } from "../state.js";
import { LAYER_MOVING } from "../constants.js";
import { setWorldSeed } from "../physics/worldRandom.js";
import { rebuildWorldObjects } from "../game/objectCount.js";
import { vanishObject } from "../game/projectiles.js";

export const OBJECT_SYNC_INTERVAL = 0.1;
const MAX_ACTIVE_OBJECTS = 220;
const IDLE_OBJECT_BATCH = 80;
const OBJECT_VELOCITY_EPS = 0.05;

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function collectRemovedKeys() {
  const keys = [];
  for (const object of state.objects) {
    if (object.exploded || object.absorbed) keys.push(object.key);
  }
  return keys;
}

export function buildWorldMessage() {
  return {
    type: "world",
    seed: state.worldSeed,
    total: state.totalObjects,
    spawnMode: state.spawnMode,
    removedKeys: collectRemovedKeys(),
  };
}

export function applyWorld(data) {
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

export function createObjectSyncMessage() {
  const objects = collectSyncObjectStates();
  const removed = collectRemovedDelta();
  if (!objects.length && !removed.length) return null;
  return {
    type: "objects",
    objects: objects.map(encodeObject),
    removed,
  };
}

export function applyObjectSync(data) {
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
