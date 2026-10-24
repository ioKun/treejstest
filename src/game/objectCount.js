import { state } from "../state.js";
import { engine } from "../engine.js";
import {
  OBJECT_COUNT_SETTLE_BIG_THRESHOLD,
  SETTLE_MAX_STEPS_BIG,
} from "../constants.js";
import { spawnObjects, settlePile } from "../physics/world.js";
import { setHighlighted } from "../graphics/highlight.js";
import { updateStats, updateRemovedCounter } from "../ui/hud.js";
import { respawnPlayer } from "./player.js";

export function clearWorldObjects() {
  const bodyInterface = state.bodyInterface;

  setHighlighted(null);
  state.held = null;

  for (const object of state.objects) {
    if (object.grownShape) {
      object.grownShape.Release();
      object.grownShape = null;
    }
    if (object.body.IsInBroadPhase()) {
      bodyInterface.RemoveBody(object.id);
    }
    bodyInterface.DestroyBody(object.id);
  }

  state.objects.length = 0;
  state.stickyCapsules.length = 0;
  state.armed.length = 0;
  state.removed = 0;

  for (const mesh of Object.values(state.instances)) {
    engine.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  state.instances = {};
}

export function rebuildWorldObjects(totalCount) {
  clearWorldObjects();

  const ufoMode = state.spawnMode === "ufo";
  spawnObjects(totalCount, ufoMode);
  state.totalObjects = state.objects.length;

  if (!ufoMode) {
    const settleBudget =
      totalCount > OBJECT_COUNT_SETTLE_BIG_THRESHOLD
        ? SETTLE_MAX_STEPS_BIG
        : undefined;
    settlePile(settleBudget);
  } else {
    state.pendingSettleWaves = null;
    state.pendingSettleWaveIndex = 0;
  }

  respawnPlayer();
  updateStats();
  updateRemovedCounter(true);
  state.levelStartTime = performance.now();
}
