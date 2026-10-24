import { state } from "../state.js";
import { rebuildWorldObjects } from "../game/objectCount.js";
import { resetWorld } from "../game/reset.js";

const LOADER_REBUILD_TEXT = "Пересборка уровня…";

export function initMenu() {
  const menu = document.getElementById("menu");
  const panel = document.querySelector("#menu-panel");
  const select = document.getElementById("object-count");
  const modeSelect = document.getElementById("spawn-mode");
  const resumeButton = document.getElementById("menu-resume");
  const resetButton = document.getElementById("menu-reset");
  const touchMenuButton = document.getElementById("touch-menu");
  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loader-text");

  let rebuilding = false;

  function setMenu(open) {
    state.paused = open;
    menu.classList.toggle("open", open);
    select.value = String(state.totalObjects);
    if (modeSelect) modeSelect.value = state.spawnMode;
  }

  function toggleMenu() {
    if (state.victory) return;
    if (loader && !loader.classList.contains("hidden")) return;
    setMenu(!menu.classList.contains("open"));
  }

  function rebuildWithLoader(next) {
    rebuilding = true;
    select.disabled = true;

    if (loader) {
      loader.classList.remove("hidden");
      loaderText.textContent = LOADER_REBUILD_TEXT;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          rebuildWorldObjects(next);
        } finally {
          if (loader) loader.classList.add("hidden");

          select.disabled = false;
          select.value = String(state.totalObjects);
          rebuilding = false;
        }
      });
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Escape") return;
    event.preventDefault();
    toggleMenu();
  });

  if (panel) {
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
  }

  menu.addEventListener("pointerdown", () => {
    if (!rebuilding) setMenu(false);
  });

  resumeButton.addEventListener("click", () => setMenu(false));

  resetButton.addEventListener("click", () => {
    resetWorld();
    state.victory = false;
    state.levelStartTime = performance.now();
    const victoryEl = document.getElementById("victory");
    if (victoryEl) victoryEl.classList.remove("open");
    setMenu(false);
  });

  touchMenuButton.addEventListener("click", () => toggleMenu());

  select.value = String(state.totalObjects);
  if (modeSelect) modeSelect.value = state.spawnMode;

  select.addEventListener("change", () => {
    const next = Number(select.value);
    if (!next || next === state.totalObjects) return;
    rebuildWithLoader(next);
  });

  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      const nextMode = modeSelect.value;
      if (nextMode === state.spawnMode) return;
      state.spawnMode = nextMode;
      rebuildWithLoader(state.totalObjects);
    });
  }
}
