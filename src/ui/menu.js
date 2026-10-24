import { state } from "../state.js";
import { rebuildWorldObjects } from "../game/objectCount.js";
import { resetWorld } from "../game/reset.js";
import { createRoom, joinRoom, leaveRoom, getRoomLink, autoJoinFromUrl } from "../network/index.js";

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

  const mpName = document.getElementById("mp-name");
  const mpRoom = document.getElementById("mp-room");
  const mpCreate = document.getElementById("mp-create");
  const mpJoin = document.getElementById("mp-join");
  const mpLeave = document.getElementById("mp-leave");
  const mpStatus = document.getElementById("mp-status");
  const mpPeers = document.getElementById("mp-peers");
  const mpLinkRow = document.getElementById("mp-link-row");
  const mpLink = document.getElementById("mp-link");
  const mpCopy = document.getElementById("mp-copy");
  const roomFromUrl = new URLSearchParams(window.location.search).get("room");
  if (roomFromUrl && mpRoom) mpRoom.value = roomFromUrl;

  function refreshMultiplayerStatus() {
    const mp = state.multiplayer;
    if (mpStatus) {
      if (mp.error) mpStatus.textContent = `Ошибка: ${mp.error}`;
      else if (mp.role === "host") mpStatus.textContent = `Хост · код: ${mp.roomId}`;
      else if (mp.role === "client") mpStatus.textContent = `Клиент · комната: ${mp.roomId}`;
      else mpStatus.textContent = "Не подключено";
    }
    if (mpPeers) {
      mpPeers.textContent = mp.peers.map((p) => p.name || p.id).join(", ");
    }
    if (mpLinkRow) {
      if (mp.role === "host" && mp.roomId) {
        mpLinkRow.style.display = "";
        if (mpLink) mpLink.value = getRoomLink(mp.roomId);
      } else {
        mpLinkRow.style.display = "none";
      }
    }
  }

  if (mpCreate) {
    mpCreate.addEventListener("click", () => {
      if (mpName) localStorage.setItem("mp_name", mpName.value || "Игрок");
      createRoom(mpName ? mpName.value : "");
      refreshMultiplayerStatus();
    });
  }
  if (mpJoin) {
    mpJoin.addEventListener("click", () => {
      if (mpName) localStorage.setItem("mp_name", mpName.value || "Игрок");
      joinRoom(mpRoom ? mpRoom.value.trim() : "", mpName ? mpName.value : "");
      refreshMultiplayerStatus();
    });
  }
  if (mpCopy) {
    mpCopy.addEventListener("click", () => {
      if (mpLink) {
        mpLink.select();
        try { navigator.clipboard.writeText(mpLink.value); } catch (e) {}
      }
    });
  }
  if (mpLeave) {
    mpLeave.addEventListener("click", () => {
      leaveRoom();
      refreshMultiplayerStatus();
    });
  }

  setInterval(refreshMultiplayerStatus, 1000);
}
