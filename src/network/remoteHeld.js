import { state } from "../state.js";
import {
  REMOTE_HELD_SNAP_DISTANCE,
  REMOTE_HELD_SNAP_Y,
} from "../constants.js";

function snapObjectToBody(object, body) {
  const p = body.GetPosition();
  const bx = p.GetX();
  const by = p.GetY();
  const bz = p.GetZ();
  const op = object.body.GetPosition();
  const ox = op.GetX();
  const oy = op.GetY();
  const oz = op.GetZ();
  if (Math.hypot(bx - ox, by - oy, bz - oz) < REMOTE_HELD_SNAP_DISTANCE) return;
  const q = object.body.GetRotation();
  state.tmpQuat.Set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
  state.tmpRVec3.Set(bx, by + REMOTE_HELD_SNAP_Y, bz);
  state.bodyInterface.SetPositionAndRotation(
    object.id,
    state.tmpRVec3,
    state.tmpQuat,
    state.J.EActivation_Activate
  );
  state.bodyInterface.SetLinearAndAngularVelocity(
    object.id,
    state.zeroVec3,
    state.zeroVec3
  );
}

export function releaseRemoteHeldObject(peerId) {
  const remoteHeld = state.multiplayer.remoteHeld;
  if (!remoteHeld) return;
  const object = remoteHeld.get(peerId);
  if (!object) return;
  remoteHeld.delete(peerId);
  if (object.exploded || object.absorbed) return;
  try {
    state.bodyInterface.SetGravityFactor(object.id, 1);
    state.bodyInterface.ActivateBody(object.id);
  } catch (e) {}
}

export function releaseAllRemoteHeld() {
  const remoteHeld = state.multiplayer.remoteHeld;
  if (!remoteHeld) return;
  for (const peerId of [...remoteHeld.keys()]) releaseRemoteHeldObject(peerId);
}

export function clearRemoteHeld() {
  if (state.multiplayer.remoteHeld) state.multiplayer.remoteHeld.clear();
}

export function syncRemoteHeld(peerId, heldInfo, hostHeld, body) {
  const remoteHeld = state.multiplayer.remoteHeld;
  if (!remoteHeld) return null;
  let current = remoteHeld.get(peerId) || null;
  if (
    current &&
    (current.exploded ||
      current.absorbed ||
      state.objectByKey.get(current.key) !== current)
  ) {
    releaseRemoteHeldObject(peerId);
    current = null;
  }
  const key = heldInfo && heldInfo.key;
  if (current && current.key === key) return current;
  if (current) releaseRemoteHeldObject(peerId);
  if (!key) return null;
  const object = state.objectByKey.get(key);
  if (!object || object.exploded || object.absorbed) return null;
  if (object === hostHeld) return null;
  for (const [otherPeer, otherObject] of remoteHeld.entries()) {
    if (otherPeer !== peerId && otherObject === object) return null;
  }
  remoteHeld.set(peerId, object);
  state.bodyInterface.SetGravityFactor(object.id, 0);
  state.bodyInterface.SetAngularVelocity(object.id, state.zeroVec3);
  state.bodyInterface.ActivateBody(object.id);
  if (body) snapObjectToBody(object, body);
  return object;
}
