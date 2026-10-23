import { state } from "../state.js";
import { setHighlighted } from "../graphics/highlight.js";
import { findGrabTarget } from "../game/grab.js";

let statsEl = null;
let countEl = null;
let totalEl = null;
let hintActive = false;

export function setHint(text, active) {
  if (state.hintText !== text) {
    state.hintText = text;
    state.hintEl.textContent = text;
  }
  if (hintActive !== active) {
    hintActive = active;
    state.hintEl.classList.toggle("active", active);
  }
}

const HELD_HINTS = {
  sphere: (touch, suffix) =>
    `ШАР · ${touch ? "Тап" : "ЛКМ"} — бросить со взрывом${suffix}`,
  box: (touch, suffix) =>
    `КУБ · ${touch ? "Тап" : "ЛКМ"} — бросить, создаёт чёрную дыру${suffix}`,
  frame: (touch, suffix) =>
    `РАМА · ${touch ? "Тап" : "ЛКМ"} — бросить, создаёт портал${suffix}`,
  gear: (touch, suffix) =>
    `ШЕСТЕРЁНКА · ${touch ? "Тап" : "ЛКМ"} — бросить, запускает торнадо${suffix}`,
  capsule: (touch, suffix) =>
    `КАПСУЛА · ${touch ? "Тап" : "ЛКМ"} — бросить, растёт и липнет${suffix}`,
};

export function updateHighlight() {
  const touch = document.body.classList.contains("touch");
  const action = touch ? "Тап" : "ЛКМ";
  const suffix = touch ? "" : " · E — отпустить";

  if (state.held) {
    setHighlighted(null);
    const heldText =
      HELD_HINTS[state.held.type]?.(touch, suffix) ||
      (touch ? "Тап — бросить" : "ЛКМ — бросить · E — отпустить");
    setHint(heldText, true);
    return;
  }

  const object = findGrabTarget();
  setHighlighted(object);

  if (object) {
    setHint(`${object.name.toUpperCase()} · ${action} — схватить`, true);
  } else {
    setHint(
      touch
        ? "Свайп — камера · Тап — взять / бросить"
        : "Перетаскивай мышь — камера · Колесо — зум",
      false
    );
  }
}

export function updateStats() {
  if (!statsEl) statsEl = document.getElementById("stats");
  if (!statsEl) return;
  statsEl.textContent = `Jolt MT · ${state.workerThreads} потоков · ${state.objects.length} предметов`;
}

export function updateRemovedCounter(force = false) {
  if (!force && state.removed === state.removedShown) return;
  state.removedShown = state.removed;

  if (!countEl) countEl = document.getElementById("removed-count");
  if (!totalEl) totalEl = document.getElementById("removed-total");
  if (countEl) countEl.textContent = String(state.removed);
  if (totalEl) totalEl.textContent = String(state.totalObjects);
}
