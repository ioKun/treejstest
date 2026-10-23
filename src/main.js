import "./style.css";
import { state } from "./state.js";
import { initGraphics, updateCamera } from "./graphics/renderer.js";
import { initPhysics } from "./physics/jolt.js";
import {
  buildGroundPhysics,
  createPlayerBody,
  spawnObjects,
  settlePile,
} from "./physics/world.js";
import { buildShredderPhysics } from "./physics/shredder.js";
import { readPlayerState } from "./physics/helpers.js";
import { buildStickman } from "./graphics/stickman.js";
import { setupInput } from "./input/index.js";
import { syncMeshes, restartClock, animate } from "./loop.js";
import { updateStats, updateRemovedCounter } from "./ui/hud.js";
import { tryGrab, throwHeld, dropHeld } from "./game/grab.js";
import { resetWorld } from "./game/reset.js";

async function boot() {
  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loader-text");

  state.hintEl = document.getElementById("hint");

  if (!crossOriginIsolated && navigator.serviceWorker) {
    loaderText.textContent = "Включение cross-origin isolation…";
    setTimeout(() => {
      if (!crossOriginIsolated) {
        loaderText.textContent =
          "Не удалось включить cross-origin isolation. Нужны HTTPS и поддержка Service Worker.";
      }
    }, 6000);
    return;
  }

  initGraphics();

  loaderText.textContent = "Инициализация Jolt MT…";
  await initPhysics();

  loaderText.textContent = "Сборка мира…";
  buildGroundPhysics();
  buildShredderPhysics();
  buildStickman();
  createPlayerBody();
  spawnObjects();
  state.totalObjects = state.objects.length;

  loaderText.textContent = "Усадка кучи…";
  settlePile();

  setupInput();
  readPlayerState();
  syncMeshes();
  updateCamera();
  updateStats();
  updateRemovedCounter(true);

  if (import.meta.env.DEV) {
    window.__game = state;
    window.__gameApi = { tryGrab, throwHeld, dropHeld, resetWorld };
  }

  loaderText.textContent = "Готово";
  requestAnimationFrame(() => loader.classList.add("hidden"));
  setTimeout(() => loader.remove(), 700);

  restartClock();
  requestAnimationFrame(animate);
}

function reportFatalError(error) {
  console.error(error);
  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loader-text");
  if (!loader || !loaderText) return;
  loader.classList.remove("hidden");
  loader.classList.add("error");
  loader.style.opacity = "1";
  loader.style.visibility = "visible";
  loaderText.textContent =
    "Не удалось запустить игру.\n\n" +
    (error && error.message ? error.message : String(error)) +
    "\n\nJolt MT требует SharedArrayBuffer и cross-origin isolation. " +
    "Запускай через «npm run dev» или «npm run preview» — в конфиге Vite уже выставлены COOP/COEP.";
}

boot().catch(reportFatalError);
