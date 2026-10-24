import { state } from "../state.js";
import {
  LAYER_MOVING,
  CAPSULE_GROW,
} from "../constants.js";
import { releaseStuckObjects } from "./capsule.js";
import { resetExplosionFx } from "../fx/explosion.js";
import { resetConfettiFx } from "../fx/confetti.js";
import { resetBlackHoleFx } from "../fx/blackhole.js";
import { resetPortalFx } from "../fx/portal.js";
import { resetTornadoFx } from "../fx/tornado.js";
import { respawnPlayer } from "./player.js";

export function resetWorld() {
  const J = state.J;

  if (state.held) {
    state.bodyInterface.SetGravityFactor(state.held.id, 1);
    state.held = null;
  }

  state.armed.length = 0;
  state.removed = 0;
  resetExplosionFx();
  resetConfettiFx();
  resetBlackHoleFx();
  resetPortalFx();
  resetTornadoFx();

  for (const object of state.objects) {
    if (object.stuckObjects && object.stuckObjects.length) {
      releaseStuckObjects(object);
    }
  }
  state.stickyCapsules.length = 0;

  for (const object of state.objects) {
    if (object.exploded || object.absorbed) {
      state.bodyInterface.AddBody(object.id, J.EActivation_Activate);
      object.exploded = false;
      object.absorbed = false;
    }

    if (object.type === "capsule") {
      if (object.grownShape) {
        state.bodyInterface.SetShape(
          object.id,
          object.shape,
          true,
          J.EActivation_Activate
        );
        object.grownShape.Release();
        object.grownShape = null;
      }
      object.sticky = false;
      object.scale.copy(object.baseScale);
      object.bounds.copy(object.baseBounds);
      object.radius = object.baseRadius;
    }

    object.stuckTo = null;
    state.bodyInterface.SetObjectLayer(object.id, LAYER_MOVING);
    object.portalFall = false;

    state.tmpRVec3.Set(
      object.spawnPosition.x,
      object.spawnPosition.y,
      object.spawnPosition.z
    );
    state.tmpQuat.Set(
      object.spawnRotation.x,
      object.spawnRotation.y,
      object.spawnRotation.z,
      object.spawnRotation.w
    );
    state.bodyInterface.SetPositionAndRotation(
      object.id,
      state.tmpRVec3,
      state.tmpQuat,
      J.EActivation_Activate
    );
    state.bodyInterface.SetLinearAndAngularVelocity(
      object.id,
      state.zeroVec3,
      state.zeroVec3
    );
    state.bodyInterface.SetGravityFactor(object.id, 1);
    object.fuse = 0;
  }

  respawnPlayer();

  state.victory = false;
  const victoryEl = document.getElementById("victory");
  if (victoryEl) victoryEl.classList.remove("open");

  if (state.spawnMode === "ufo" && state.objects.length) {
    for (const object of state.objects) {
      if (object.exploded || object.absorbed) {
        state.bodyInterface.AddBody(object.id, state.J.EActivation_DontActivate);
        object.exploded = false;
        object.absorbed = false;
      }
      state.bodyInterface.SetObjectLayer(object.id, LAYER_MOVING);
      object.spawnPosition.set(object.position.x, object.position.y, object.position.z);
    }
    state.ufoQueue = state.objects.slice();
    state.ufoReleased = 0;
    state.ufoTimer = 0;
    state.ufoActive = true;
  }
}
