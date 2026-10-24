import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import { PLAYER_SPAWN_Y, RUN_SPEED } from "../constants.js";
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
    velocity: new THREE.Vector3(),
    walkPhase: 0,
  });
}

export function removeRemotePlayerVisual(peerId) {
  const remote = state.multiplayer.remotePlayers.get(peerId);
  if (!remote) return;
  engine.scene.remove(remote.root);
  remote.root.traverse((child) => {
    if (child.isMesh) {
      child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  });
  state.multiplayer.remotePlayers.delete(peerId);
}

export function updateRemotePlayerVisual(peerId, data) {
  const remote = state.multiplayer.remotePlayers.get(peerId);
  if (!remote) return;
  if (data.x !== undefined) remote.root.position.set(data.x, data.y, data.z);
  if (data.yaw !== undefined) remote.root.rotation.y = data.yaw;
  if (data.vx !== undefined) remote.velocity.set(data.vx, data.vy, data.vz);
}

export function animateRemotePlayers(dt) {
  for (const remote of state.multiplayer.remotePlayers.values()) {
    const speed = Math.hypot(remote.velocity.x, remote.velocity.z);
    const intensity = THREE.MathUtils.clamp(speed / RUN_SPEED, 0, 1);
    remote.walkPhase += dt * (2.2 + speed * 2.4);
    const swing = Math.sin(remote.walkPhase) * 0.85 * intensity;
    const { leftArm, rightArm, leftLeg, rightLeg } = remote.limbs;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    leftArm.rotation.x = -swing * 0.8;
    rightArm.rotation.x = swing * 0.8;
  }
}

export function syncRemoteVisualsFromBodies() {
  if (!state.multiplayer || state.multiplayer.role !== "host") return;
  if (!state.multiplayer.remoteBodies) return;
  for (const [peerId, body] of state.multiplayer.remoteBodies.entries()) {
    const remote = state.multiplayer.remotePlayers.get(peerId);
    if (!remote || !body) continue;
    const p = body.GetPosition();
    remote.root.position.set(p.GetX(), p.GetY(), p.GetZ());
    const v = state.bodyInterface.GetLinearVelocity(body.GetID());
    remote.velocity.set(v.GetX(), v.GetY(), v.GetZ());
    const input = state.multiplayer.inputs ? state.multiplayer.inputs.get(peerId) : null;
    if (input && typeof input.yaw === "number") remote.root.rotation.y = input.yaw;
  }
}