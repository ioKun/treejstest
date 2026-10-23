import * as THREE from "three";
import {
  state,
  playerPos,
  playerVel,
  aimDir,
  flatForward,
} from "../state.js";
import {
  GRAB_CONE,
  GRAB_DISTANCE,
  THROW_SPEED,
  PICKUP_MIN_DISTANCE,
  GRAB_SCORE_DOT_WEIGHT,
  THROW_DROP_NUDGE,
} from "../constants.js";
import {
  readPlayerState,
  getAimDirection,
  getFlatForward,
  setBodyVelocity,
} from "../physics/helpers.js";
import { activateStickyCapsule } from "./capsule.js";
import { armObject } from "./projectiles.js";

export function findGrabTarget() {
  getAimDirection(aimDir);

  const originX = playerPos.x;
  const originY = playerPos.y + 0.32;
  const originZ = playerPos.z;

  let best = null;
  let bestScore = Infinity;

  for (const object of state.objects) {
    if (
      object === state.held ||
      object.exploded ||
      object.absorbed ||
      object.portalFall ||
      object.stuckTo
    ) {
      continue;
    }

    const dx = object.position.x - originX;
    const dy = object.position.y - originY;
    const dz = object.position.z - originZ;
    const distance = Math.hypot(dx, dy, dz);

    if (distance < PICKUP_MIN_DISTANCE || distance > GRAB_DISTANCE) continue;

    const dot = (dx * aimDir.x + dy * aimDir.y + dz * aimDir.z) / distance;
    if (dot < GRAB_CONE) continue;

    const score = distance * (GRAB_SCORE_DOT_WEIGHT - dot);
    if (score < bestScore) {
      bestScore = score;
      best = object;
    }
  }

  return best;
}

export function tryGrab() {
  if (state.held) return;

  readPlayerState();
  const object = findGrabTarget();
  if (!object) return;

  state.held = object;
  state.bodyInterface.SetGravityFactor(object.id, 0);
  state.bodyInterface.SetAngularVelocity(object.id, state.zeroVec3);
  state.bodyInterface.ActivateBody(object.id);
}

export function dropHeld() {
  const object = state.held;
  if (!object) return;

  getFlatForward(flatForward);
  state.bodyInterface.SetGravityFactor(object.id, 1);
  setBodyVelocity(
    object.id,
    flatForward.x * THROW_DROP_NUDGE,
    0,
    flatForward.z * THROW_DROP_NUDGE
  );
  state.bodyInterface.ActivateBody(object.id);
  state.held = null;
}

export function throwHeld() {
  const object = state.held;
  if (!object) return;

  readPlayerState();
  getAimDirection(aimDir);

  const vx = aimDir.x * THROW_SPEED + playerVel.x * 0.5;
  const vy = aimDir.y * THROW_SPEED + 1.1;
  const vz = aimDir.z * THROW_SPEED + playerVel.z * 0.5;

  state.bodyInterface.SetGravityFactor(object.id, 1);
  if (object.type === "capsule") activateStickyCapsule(object);
  if (object.type === "gear") {
    if (!object.throwDirection) object.throwDirection = new THREE.Vector3();
    object.throwDirection.set(vx, 0, vz);
    if (object.throwDirection.lengthSq() < 0.01) {
      getFlatForward(object.throwDirection);
    } else {
      object.throwDirection.normalize();
    }
  }
  setBodyVelocity(object.id, vx, vy, vz);

  const spin = state.tmpVec3b;
  spin.Set(
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10
  );
  state.bodyInterface.SetAngularVelocity(object.id, spin);
  state.bodyInterface.ActivateBody(object.id);

  if (
    object.type === "sphere" ||
    object.type === "box" ||
    object.type === "frame" ||
    object.type === "gear"
  ) {
    armObject(object);
  }

  state.held = null;
}

export function primaryAction() {
  if (state.held) throwHeld();
  else tryGrab();
}

export function toggleHold() {
  if (state.held) dropHeld();
  else tryGrab();
}
