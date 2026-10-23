import { engine } from "../engine.js";
import { playerPos, playerVel, cameraPoint, state } from "../state.js";

export function readPlayerState() {
  const p = state.playerBody.GetPosition();
  playerPos.set(p.GetX(), p.GetY(), p.GetZ());

  const v = state.bodyInterface.GetLinearVelocity(state.playerId);
  playerVel.set(v.GetX(), v.GetY(), v.GetZ());
}

export function readBodyPosition(object, out) {
  const p = object.body.GetPosition();
  out.set(p.GetX(), p.GetY(), p.GetZ());
  return out;
}

export function getAimDirection(out) {
  cameraPoint.copy(playerPos);
  cameraPoint.y += 0.55;
  return out.copy(cameraPoint).sub(engine.camera.position).normalize();
}

export function getFlatForward(out) {
  return out.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
}

export function castRay(origin, direction, maxDistance) {
  state.ray.mOrigin.Set(origin.x, origin.y, origin.z);
  state.ray.mDirection.Set(
    direction.x * maxDistance,
    direction.y * maxDistance,
    direction.z * maxDistance
  );

  state.rayCollector.Reset();
  state.query.CastRay(
    state.ray,
    state.raySettings,
    state.rayCollector,
    state.bpFilterMoving,
    state.olFilterMoving,
    state.ignorePlayerFilter,
    state.shapeFilter
  );

  return state.rayCollector.HadHit();
}

export function setBodyVelocity(id, x, y, z) {
  const velocity = state.tmpVec3;
  velocity.Set(x, y, z);
  state.bodyInterface.SetLinearVelocity(id, velocity);
}
