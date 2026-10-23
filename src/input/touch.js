import { state } from "../state.js";
import { resetWorld } from "../game/reset.js";

export function setupTouch() {
  const pad = document.getElementById("move-pad");
  const stick = document.getElementById("move-stick");
  const jumpButton = document.getElementById("touch-jump");
  const resetButton = document.getElementById("touch-reset");

  if (!pad || !stick || !jumpButton || !resetButton) return;

  let pointerId = -1;
  let centerX = 0;
  let centerY = 0;
  let maxRadius = 36;

  const resetMove = () => {
    pointerId = -1;
    pad.classList.remove("active");
    stick.style.transform = "translate(0px, 0px)";
    state.touchMove.x = 0;
    state.touchMove.y = 0;
    state.touchRun = false;
  };

  const applyMove = (event) => {
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    const clamped = Math.min(length, maxRadius);
    const nx = length > 0.001 ? dx / length : 0;
    const ny = length > 0.001 ? dy / length : 0;
    const x = nx * clamped;
    const y = ny * clamped;

    stick.style.transform = `translate(${x}px, ${y}px)`;
    state.touchMove.x = x / maxRadius;
    state.touchMove.y = -y / maxRadius;
    state.touchRun = Math.hypot(state.touchMove.x, state.touchMove.y) > 0.8;
  };

  const endMove = (event) => {
    if (pointerId !== -1 && event.pointerId !== pointerId) return;
    resetMove();
  };

  pad.addEventListener("pointerdown", (event) => {
    if (pointerId !== -1) return;
    event.preventDefault();
    pointerId = event.pointerId;
    const rect = pad.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    maxRadius = rect.width * 0.3;
    pad.classList.add("active");
    try {
      pad.setPointerCapture(event.pointerId);
    } catch {
      if (import.meta.env.DEV) console.warn("Pointer capture unavailable");
    }
    applyMove(event);
  });

  pad.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    applyMove(event);
  });

  pad.addEventListener("pointerup", endMove);
  pad.addEventListener("pointercancel", endMove);
  pad.addEventListener("lostpointercapture", endMove);
  window.addEventListener("blur", resetMove);

  jumpButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    state.jumpQueued = true;
  });

  resetButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    resetMove();
    resetWorld();
  });
}
