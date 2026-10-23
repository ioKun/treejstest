import { setupKeyboard } from "./keyboard.js";
import { setupPointer } from "./pointer.js";
import { setupTouch } from "./touch.js";

export function setupInput() {
  setupKeyboard();
  setupPointer();

  if (window.matchMedia("(pointer: coarse)").matches) {
    document.body.classList.add("touch");
    setupTouch();
  }
}
