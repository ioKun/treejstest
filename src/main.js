import "./style.css";
import { state } from "./state.js";
import { startSelectedScene } from "./scenes/boot.js";

async function boot() {
  const loaderText = document.getElementById("loader-text");

  state.hintEl = document.getElementById("hint");

  if (!crossOriginIsolated && navigator.serviceWorker) {
    loaderText.textContent = "Включение cross-origin isolation…";
    setTimeout(() => {
      if (!crossOriginIsolated) {
        loaderText.textContent =
          "Не удалось включить cross-origin isolation. Нужны HTTPS и поддержка Service Worker.";
      }
    }, 6000);
    return;
  }

  await startSelectedScene();
}

function reportFatalError(error) {
  console.error(error);
  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loader-text");
  if (!loader || !loaderText) return;
  loader.classList.remove("hidden");
  loader.classList.add("error");
  loader.style.opacity = "1";
  loader.style.visibility = "visible";
  loaderText.textContent =
    "Не удалось запустить игру.\n\n" +
    (error && error.message ? error.message : String(error)) +
    "\n\nJolt MT требует SharedArrayBuffer и cross-origin isolation. " +
    "Запускай через «npm run dev» или «npm run preview» — в конфиге Vite уже выставлены COOP/COEP.";
}

boot().catch(reportFatalError);
