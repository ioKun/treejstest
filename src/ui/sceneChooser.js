import { state } from "../state.js";
import { SCENE_CATALOG } from "../scenes/sceneCatalog.js";
import { selectScene } from "../scenes/sceneSelection.js";

export function initSceneChooser() {
  const container = document.getElementById("scene-actions");
  if (!container) return;
  container.innerHTML = "";
  SCENE_CATALOG.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-button";
    if (entry.id === state.sceneId) button.classList.add("active");
    button.textContent = entry.title;
    button.dataset.sceneId = entry.id;
    button.setAttribute("aria-pressed", String(entry.id === state.sceneId));
    button.addEventListener("click", () => {
      if (entry.id === state.sceneId) {
        const resume = document.getElementById("menu-resume");
        if (resume) resume.click();
      } else {
        selectScene(entry.id);
      }
    });
    container.appendChild(button);
  });
}
