import { state } from "../state.js";
import { resetWorld } from "../game/reset.js";
import { rebuildWorldObjects } from "../game/objectCount.js";
import { LEADERBOARD_KEY, LEADERBOARD_SIZE } from "../constants.js";

const victoryEl = () => document.getElementById("victory");
const timeEl = () => document.getElementById("victory-time");
const entryEl = () => document.getElementById("victory-entry");
const initialsEl = () => document.getElementById("victory-initials");
const boardEl = () => document.getElementById("victory-board");

let saved = false;

function loadBoard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveBoard(board) {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board));
  } catch (e) {}
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function renderBoard(highlightIndex = -1) {
  const board = loadBoard();
  const ol = boardEl();
  if (!ol) return;
  ol.innerHTML = "";
  board.slice(0, LEADERBOARD_SIZE).forEach((entry, index) => {
    const li = document.createElement("li");
    if (index === highlightIndex) li.style.color = "#7bd3ff";
    li.innerHTML = `<span class="rank">${index + 1}.</span><span class="initials">${entry.initials}</span><span class="time">${formatTime(entry.time)} · ${entry.count}</span>`;
    ol.appendChild(li);
  });
}

function qualifies(time) {
  const board = loadBoard();
  if (board.length < LEADERBOARD_SIZE) return true;
  const worst = board[LEADERBOARD_SIZE - 1].time;
  return time < worst;
}

export function showVictory() {
  const elapsed = (performance.now() - state.levelStartTime) / 1000;
  saved = false;
  const el = victoryEl();
  if (!el) return;
  if (timeEl()) timeEl().textContent = elapsed.toFixed(2);
  const entry = entryEl();
  if (entry) entry.style.display = qualifies(elapsed) ? "flex" : "none";
  renderBoard();
  el.classList.add("open");
  const input = initialsEl();
  if (input && qualifies(elapsed)) {
    input.value = "AAA";
    setTimeout(() => input.focus(), 50);
  }
}

export function hideVictory() {
  const el = victoryEl();
  if (el) el.classList.remove("open");
}

export function initVictory() {
  const saveButton = document.getElementById("victory-save");
  const replayButton = document.getElementById("victory-replay");
  const input = initialsEl();

  if (saveButton) {
    saveButton.addEventListener("click", () => {
      if (saved) return;
      const elapsed = (performance.now() - state.levelStartTime) / 1000;
      let initials = (input?.value || "AAA").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (initials.length === 0) initials = "AAA";
      initials = initials.slice(0, 3).padEnd(3, "A");

      const board = loadBoard();
      board.push({ initials, time: elapsed, count: state.totalObjects, date: Date.now() });
      board.sort((a, b) => a.time - b.time);
      const trimmed = board.slice(0, LEADERBOARD_SIZE);
      saveBoard(trimmed);
      saved = true;
      const idx = trimmed.findIndex((e) => e.initials === initials && Math.abs(e.time - elapsed) < 0.001);
      renderBoard(idx);
      if (entryEl()) entryEl().style.display = "none";
    });
  }

  if (replayButton) {
    replayButton.addEventListener("click", () => {
      hideVictory();
      state.victory = false;
      state.paused = false;
      resetWorld();
      state.levelStartTime = performance.now();
      if (state.spawnMode === "ufo") {
        rebuildWorldObjects(state.totalObjects);
      }
    });
  }

  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.code === "Enter") {
        event.preventDefault();
        saveButton?.click();
      }
    });
  }
}
