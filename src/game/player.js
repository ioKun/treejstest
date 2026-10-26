import * as THREE from "three";
import {
  state,
  playerPos,
  playerVel,
  aimDir,
  flatForward,
  moveDir,
  targetVec,
} from "../state.js";
import {
  JUMP_SPEED,
  PLAYER_HALF_TOTAL,
  RUN_SPEED,
  WALK_SPEED,
  PLAYER_MOVE_GROUND_CONTROL,
  PLAYER_MOVE_AIR_CONTROL,
  PLAYER_BRAKE_LAMBDA,
  HOLD_DISTANCE,
  HOLD_SPRING_STIFFNESS,
  HOLD_MAX_SPEED,
  HOLD_DROP_DISTANCE,
} from "../constants.js";
import {
  readPlayerState,
  readBodyPosition,
  getFlatForward,
  castRay,
  setBodyVelocity,
} from "../physics/helpers.js";
import { dropHeld } from "./grab.js";

const heldPos = new THREE.Vector3();
const holdVelocity = new THREE.Vector3();

export function updatePlayer(dt) {
  readPlayerState();
  state.grounded = checkGrounded();

  const forwardInput =
    (state.keys.has("KeyW") ? 1 : 0) -
    (state.keys.has("KeyS") ? 1 : 0) +
    state.touchMove.y;
  const sideInput =
    (state.keys.has("KeyD") ? 1 : 0) -
    (state.keys.has("KeyA") ? 1 : 0) +
    state.touchMove.x;

  getFlatForward(flatForward);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);

  moveDir.set(
    flatForward.x * forwardInput + rightX * sideInput,
    0,
    flatForward.z * forwardInput + rightZ * sideInput
  );

  const moving = moveDir.lengthSq() > 0.0001;
  if (moving) moveDir.normalize();

  const running =
    state.keys.has("ShiftLeft") ||
    state.keys.has("ShiftRight") ||
    state.touchRun;
  const speed = running ? RUN_SPEED : WALK_SPEED;

  let vy = playerVel.y;

  if (state.jumpQueued) {
    state.jumpQueued = false;
    if (state.grounded) vy = JUMP_SPEED;
  }

  const control = state.grounded
    ? PLAYER_MOVE_GROUND_CONTROL
    : PLAYER_MOVE_AIR_CONTROL;
  const blend = 1 - Math.exp(-control * dt);

  let vx = playerVel.x + (moveDir.x * speed - playerVel.x) * blend;
  let vz = playerVel.z + (moveDir.z * speed - playerVel.z) * blend;

  if (!moving && state.grounded) {
    const brake = Math.exp(-PLAYER_BRAKE_LAMBDA * dt);
    vx *= brake;
    vz *= brake;
  }

  if (playerPos.y < -12) {
    respawnPlayer();
    return;
  }

  setBodyVelocity(state.playerId, vx, vy, vz);
}

export function checkGrounded() {
  targetVec.copy(playerPos);
  targetVec.y += 0.05;
  aimDir.set(0, -1, 0);
  return castRay(targetVec, aimDir, PLAYER_HALF_TOTAL + 0.22);
}

export function updateHeld(dt, allowDrop = true) {
  const object = state.held;
  if (!object) return;

  readPlayerState();
  getFlatForward(flatForward);

  const holdDistance = HOLD_DISTANCE + object.radius * 0.55;
  targetVec.copy(playerPos);
  targetVec.y += 0.35;
  targetVec.addScaledVector(flatForward, holdDistance);

  readBodyPosition(object, heldPos);
  holdVelocity.copy(targetVec).sub(heldPos);

  if (allowDrop && holdVelocity.length() > HOLD_DROP_DISTANCE) {
    dropHeld();
    return;
  }

  holdVelocity.multiplyScalar(HOLD_SPRING_STIFFNESS);
  holdVelocity.x += playerVel.x * 0.75;
  holdVelocity.y += playerVel.y * 0.35;
  holdVelocity.z += playerVel.z * 0.75;

  if (holdVelocity.length() > HOLD_MAX_SPEED) {
    holdVelocity.setLength(HOLD_MAX_SPEED);
  }

  setBodyVelocity(object.id, holdVelocity.x, holdVelocity.y, holdVelocity.z);
  state.bodyInterface.SetAngularVelocity(object.id, state.zeroVec3);
  state.bodyInterface.ActivateBody(object.id);
}

export function respawnPlayerBody(bodyId) {
  const J = state.J;
  state.tmpRVec3.Set(
    state.playerSpawn.x,
    state.playerSpawn.y,
    state.playerSpawn.z
  );
  state.tmpQuat.Set(0, 0, 0, 1);
  state.bodyInterface.SetPositionAndRotation(
    bodyId,
    state.tmpRVec3,
    state.tmpQuat,
    J.EActivation_Activate
  );
  state.bodyInterface.SetLinearAndAngularVelocity(
    bodyId,
    state.zeroVec3,
    state.zeroVec3
  );
}

export function respawnPlayer() {
  respawnPlayerBody(state.playerId);
  readPlayerState();
}

export function forEachPlayerBody(callback) {
  if (state.playerBody) {
    callback(state.playerBody, state.playerId, null);
  }
  if (state.multiplayer.role !== "host" || !state.multiplayer.remoteBodyIds) {
    return;
  }
  for (const [peerId, bodyId] of state.multiplayer.remoteBodyIds.entries()) {
    const body = state.multiplayer.remoteBodies.get(peerId);
    if (body) callback(body, bodyId, peerId);
  }
}
