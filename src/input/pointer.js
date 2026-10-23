import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import { primaryAction } from "../game/grab.js";

export function setupPointer() {
  const canvas = engine.renderer.domElement;
  const drag = { active: false, x: 0, y: 0, moved: 0, pointerId: -1 };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag.active = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved = 0;
    drag.pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    state.yaw -= dx * 0.0055;
    state.pitch = THREE.MathUtils.clamp(
      state.pitch - dy * 0.0045,
      -0.25,
      1.15
    );
  });

  const endDrag = (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    drag.active = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (drag.moved < 7) primaryAction();
  };

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      state.distance = THREE.MathUtils.clamp(
        state.distance + event.deltaY * 0.0028,
        2.6,
        9.5
      );
    },
    { passive: false }
  );

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
}
