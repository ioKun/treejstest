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
    targetPosition: new THREE.Vector3(0, PLAYER_SPAWN_Y, 0),
    targetYaw: 0,
    facing: 0,
    velocity: new THREE.Vector3(),
    snapshotAt: 0,
    hasSnapshot: false,
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
  if (data.x !== undefined) {
    remote.targetPosition.set(data.x, data.y, data.z);
    if (!remote.hasSnapshot) {
      remote.hasSnapshot = true;
      remote.root.position.copy(remote.targetPosition);
    }
  }
  if (data.facing !== undefined) remote.targetYaw = data.facing;
  else if (data.yaw !== undefined) remote.targetYaw = data.yaw;
  if (data.vx !== undefined) {
    remote.velocity.set(data.vx, data.vy, data.vz);
    remote.snapshotAt = performance.now();
  }
}

function dampAngle(current, target, lambda, dt) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export function animateRemotePlayers(dt) {
  for (const remote of state.multiplayer.remotePlayers.values()) {
    if (state.multiplayer.role === "client" && remote.hasSnapshot) {
      const age = Math.min((performance.now() - remote.snapshotAt) / 1000, 0.12);
      const tx = remote.targetPosition.x + remote.velocity.x * age;
      const ty = remote.targetPosition.y;
      const tz = remote.targetPosition.z + remote.velocity.z * age;
      const blend = 1 - Math.exp(-20 * dt);
      remote.root.position.x += (tx - remote.root.position.x) * blend;
      remote.root.position.y += (ty - remote.root.position.y) * blend;
      remote.root.position.z += (tz - remote.root.position.z) * blend;
    }
    remote.root.rotation.y = dampAngle(remote.root.rotation.y, remote.targetYaw, 14, dt);
    remote.facing = remote.root.rotation.y;
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
    if (Math.hypot(remote.velocity.x, remote.velocity.z) > 0.35) {
      remote.targetYaw = Math.atan2(remote.velocity.x, remote.velocity.z);
    }
  }
}