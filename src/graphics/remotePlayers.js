import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import { PLAYER_SPAWN_Y } from "../constants.js";
import { createStickmanVisual } from "./stickman.js";

export function addRemotePlayerVisual(peerId) {
  if (state.multiplayer.remotePlayers.has(peerId)) return;
  const visual = createStickmanVisual();
  visual.root.position.set(0, PLAYER_SPAWN_Y, 0);
  engine.scene.add(visual.root);
  state.multiplayer.remotePlayers.set(peerId, {
    peerId,
    root: visual.root,
    limbs: visual.limbs,
    position: new THREE.Vector3(0, PLAYER_SPAWN_Y, 0),
    yaw: 0,
  });
}

export function removeRemotePlayerVisual(peerId) {
  const remote = state.multiplayer.remotePlayers.get(peerId);
  if (!remote) return;
  engine.scene.remove(remote.root);
  state.multiplayer.remotePlayers.delete(peerId);
}

export function updateRemotePlayerVisual(peerId, data) {
  const remote = state.multiplayer.remotePlayers.get(peerId);
  if (!remote) return;
  if (data.x !== undefined) remote.root.position.set(data.x, data.y, data.z);
  if (data.yaw !== undefined) remote.root.rotation.y = data.yaw;
}

export function syncRemoteVisualsFromBodies() {
  if (!state.multiplayer || state.multiplayer.role !== "host") return;
  if (!state.multiplayer.remoteBodies) return;
  for (const [peerId, body] of state.multiplayer.remoteBodies.entries()) {
    const remote = state.multiplayer.remotePlayers.get(peerId);
    if (!remote || !body) continue;
    const p = body.GetPosition();
    remote.root.position.set(p.GetX(), p.GetY(), p.GetZ());
    const input = state.multiplayer.inputs ? state.multiplayer.inputs.get(peerId) : null;
    if (input && typeof input.yaw === "number") remote.root.rotation.y = input.yaw;
  }
}