import { state } from "../state.js";
import { toggleHold } from "../game/grab.js";
import { resetWorld } from "../game/reset.js";

const PREVENTED_CODES = new Set([
  "Space",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyE",
  "KeyR",
  "ShiftLeft",
  "ShiftRight",
]);

function onKeyDown(event) {
  const code = event.code;

  if (PREVENTED_CODES.has(code)) {
    event.preventDefault();
  }

  state.keys.add(code);

  if (code === "Space" && !event.repeat) state.jumpQueued = true;
  if (code === "KeyE" && !event.repeat) toggleHold();
  if (code === "KeyR" && !event.repeat) resetWorld();
}

function onKeyUp(event) {
  state.keys.delete(event.code);
}

export function setupKeyboard() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => state.keys.clear());
}
