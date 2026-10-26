import { state } from "../state.js";
import { initPhysics } from "../physics/jolt.js";
import { readPlayerState } from "../physics/helpers.js";
import { setupInput } from "../input/index.js";
import { syncMeshes, restartClock, animate } from "../loop.js";
import { updateCamera } from "../graphics/renderer.js";
import { updateStats, updateRemovedCounter } from "../ui/hud.js";
import { tryGrab, throwHeld, dropHeld } from "../game/grab.js";
import { resetWorld } from "../game/reset.js";
import { rebuildWorldObjects } from "../game/objectCount.js";
import { startScene } from "./registry.js";
import { resolveInitialSceneId } from "./sceneSelection.js";
import { initSceneChooser } from "../ui/sceneChooser.js";

export async function startSelectedScene() {
  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loader-text");

  const sceneId = resolveInitialSceneId();
  state.sceneId = sceneId;

  loaderText.textContent = "Инициализация Jolt MT…";
  await initPhysics();

  loaderText.textContent = "Сборка мира…";
  await startScene(sceneId);

  initSceneChooser();

  setupInput();
  readPlayerState();
  syncMeshes();
  updateCamera();
  updateStats();
  updateRemovedCounter(true);
  state.levelStartTime = performance.now();

  if (import.meta.env.DEV) {
    window.__game = state;
    window.__gameApi = {
      tryGrab,
      throwHeld,
      dropHeld,
      resetWorld,
      setObjectCount: rebuildWorldObjects,
    };
  }

  loaderText.textContent = "Готово";
  requestAnimationFrame(() => loader.classList.add("hidden"));

  restartClock();
  requestAnimationFrame(animate);
}
