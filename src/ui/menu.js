import { state } from "../state.js";
import { rebuildWorldObjects } from "../game/objectCount.js";
import { resetWorld } from "../game/reset.js";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomLink,
  createManualRoom,
  joinManualRoom,
  applyManualAnswerToken,
} from "../network/index.js";

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

  const mpMode = document.getElementById("mp-mode");
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
  const manualHostRow = document.getElementById("mp-manual-host");
  const manualGuestRow = document.getElementById("mp-manual-guest");
  const mpAnswer = document.getElementById("mp-answer");
  const mpAnswerApply = document.getElementById("mp-answer-apply");
  const mpAnswerCode = document.getElementById("mp-answer-code");
  const mpAnswerCopy = document.getElementById("mp-answer-copy");
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");
  if (roomFromUrl && mpRoom) mpRoom.value = roomFromUrl;
  const manualFromUrl = params.get("manual");
  if (manualFromUrl && mpRoom) mpRoom.value = manualFromUrl;
  const storedMode = localStorage.getItem("mp_mode");
  if (mpMode) mpMode.value = manualFromUrl ? "manual" : storedMode || "manual";

  function currentMode() {
    return mpMode ? mpMode.value : "manual";
  }

  function updateModeUi() {
    const manual = currentMode() === "manual";
    if (mpCreate) mpCreate.textContent = manual ? "СОЗДАТЬ ССЫЛКУ" : "СОЗДАТЬ КОМНАТУ";
    if (mpRoom) mpRoom.placeholder = manual ? "ссылка или код приглашения" : "код комнаты";
  }

  function refreshMultiplayerStatus() {
    const mp = state.multiplayer;
    if (mpStatus) {
      if (mp.error) mpStatus.textContent = `Ошибка: ${mp.error}`;
      else if (mp.role === "host" && mp.mode === "manual") {
        mpStatus.textContent = mp.connected
          ? "Ручной хост · подключено"
          : "Ручной хост · отправьте ссылку и вставьте код ответа";
      } else if (mp.role === "client" && mp.mode === "manual") {
        mpStatus.textContent = mp.connected
          ? "Ручное подключение · клиент"
          : "Скопируйте код ответа и отправьте хосту";
      } else if (mp.role === "host") {
        mpStatus.textContent = `Хост · код: ${mp.roomId}`;
      } else if (mp.role === "client") {
        mpStatus.textContent = `Клиент · комната: ${mp.roomId}`;
      } else {
        mpStatus.textContent = "Не подключено";
      }
    }
    if (mpPeers) {
      mpPeers.textContent = mp.peers.map((p) => p.name || p.id).join(", ");
    }
    if (mpLinkRow) {
      const showLink = mp.role === "host" && (mp.manualLink || mp.roomId);
      mpLinkRow.style.display = showLink ? "" : "none";
      if (showLink && mpLink) {
        mpLink.value = mp.mode === "manual" ? mp.manualLink : getRoomLink(mp.roomId);
      }
    }
    if (manualHostRow) {
      manualHostRow.style.display =
        mp.mode === "manual" && mp.role === "host" ? "" : "none";
    }
    if (manualGuestRow) {
      manualGuestRow.style.display =
        mp.mode === "manual" && mp.role === "client" ? "" : "none";
    }
    if (mpAnswerCode && mpAnswerCode.value !== (mp.manualAnswer || "")) {
      mpAnswerCode.value = mp.manualAnswer || "";
    }
  }

  if (mpCreate) {
    mpCreate.addEventListener("click", async () => {
      const name = mpName ? mpName.value || "Игрок" : "Игрок";
      localStorage.setItem("mp_name", name);
      if (currentMode() === "manual") {
        await createManualRoom(name);
      } else {
        createRoom(name);
      }
      refreshMultiplayerStatus();
    });
  }
  if (mpJoin) {
    mpJoin.addEventListener("click", async () => {
      const name = mpName ? mpName.value || "Игрок" : "Игрок";
      localStorage.setItem("mp_name", name);
      const value = mpRoom ? mpRoom.value.trim() : "";
      if (currentMode() === "manual") {
        await joinManualRoom(value, name);
      } else {
        joinRoom(value, name);
      }
      refreshMultiplayerStatus();
    });
  }
  if (mpMode) {
    mpMode.addEventListener("change", () => {
      localStorage.setItem("mp_mode", mpMode.value);
      updateModeUi();
      refreshMultiplayerStatus();
    });
  }
  if (mpAnswerApply) {
    mpAnswerApply.addEventListener("click", async () => {
      await applyManualAnswerToken(mpAnswer ? mpAnswer.value : "");
      refreshMultiplayerStatus();
    });
  }
  if (mpAnswerCopy) {
    mpAnswerCopy.addEventListener("click", () => {
      if (mpAnswerCode) {
        mpAnswerCode.select();
        try { navigator.clipboard.writeText(mpAnswerCode.value); } catch (e) {}
      }
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

  updateModeUi();
  refreshMultiplayerStatus();
  if (manualFromUrl) setMenu(true);

  setInterval(refreshMultiplayerStatus, 1000);
}
