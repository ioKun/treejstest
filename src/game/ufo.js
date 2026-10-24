import { state } from "../state.js";
import { UFO_RELEASE_RATE, UFO_DROP_SPEED } from "../constants.js";

export function updateUfo(dt) {
  if (!state.ufoActive || !state.ufoQueue) return;

  state.ufoTimer += dt;
  const releaseCount = Math.floor(state.ufoTimer * UFO_RELEASE_RATE);
  if (releaseCount <= 0) return;
  state.ufoTimer -= releaseCount / UFO_RELEASE_RATE;

  const queue = state.ufoQueue;
  const end = Math.min(queue.length, state.ufoReleased + releaseCount);
  for (let i = state.ufoReleased; i < end; i++) {
    const object = queue[i];
    state.bodyInterface.ActivateBody(object.id);
    state.bodyInterface.SetLinearVelocity(
      object.id,
      state.zeroVec3
    );
    state.bodyInterface.SetAngularVelocity(object.id, state.zeroVec3);
  }
  state.ufoReleased = end;

  if (state.ufoReleased >= queue.length) {
    state.ufoActive = false;
    state.ufoQueue = null;
  }
}
