import { state } from "../state.js";

let activeSetupConnection = null;
let watcherStarted = false;

export function describePeerError(err) {
  const type = err && err.type;
  if (type === "peer-unavailable") return "Комната не найдена: хост офлайн или неверный код";
  if (type === "unavailable-id") return "Этот ID уже занят, попробуйте ещё раз";
  if (type === "browser-incompatible") return "Браузер не поддерживает WebRTC";
  if (type === "invalid-id") return "Неверный ID комнаты";
  if (type === "invalid-key") return "Неверный ключ PeerJS-сервера";
  if (type === "ssl-unavailable") return "Проблема с SSL PeerJS-сервера";
  if (
    type === "network" ||
    type === "server-error" ||
    type === "socket-error" ||
    type === "socket-closed"
  ) {
    return "PeerJS-сервер недоступен. Проверьте настройки сервера или включите ручной режим";
  }
  return err && err.message ? err.message : "Ошибка сети PeerJS";
}

export function schedulePeerReconnect(peer, delay = 0) {
  const mp = state.multiplayer;
  if (!mp || mp.peer !== peer || peer.destroyed) return;
  if (!peer.disconnected) return;
  if (mp.peerReconnectAttempts >= 20) {
    mp.error = "Связь с PeerJS-сервером потеряна. Создайте комнату заново";
    return;
  }
  const now = Date.now();
  const wait = Math.max(delay, 2000 - (now - (mp.lastPeerReconnectAt || 0)));
  if (wait > 0) {
    setTimeout(() => schedulePeerReconnect(peer, 0), wait);
    return;
  }
  mp.lastPeerReconnectAt = now;
  mp.peerReconnectAttempts += 1;
  try { peer.reconnect(); } catch (e) {}
}

export function attachPeerReconnect(peer) {
  peer.on("open", () => {
    if (state.multiplayer.peer !== peer) return;
    state.multiplayer.peerReconnectAttempts = 0;
    state.multiplayer.lastPeerReconnectAt = 0;
  });
  peer.on("disconnected", () => {
    if (state.multiplayer.peer !== peer) return;
    schedulePeerReconnect(peer, 1000);
  });
}

export function armPeerTimeout(peer) {
  const timer = setTimeout(() => {
    if (state.multiplayer.peer !== peer) return;
    if (peer.open) return;
    state.multiplayer.error =
      "Не удалось подключиться к PeerJS-серверу. Проверьте настройки или включите ручной режим";
  }, 12000);
  peer.on("open", () => clearTimeout(timer));
  peer.on("error", () => clearTimeout(timer));
}

export function handlePeerError(err) {
  const mp = state.multiplayer;
  const type = err && err.type;
  if (mp.connections.size > 0) return;
  mp.connected = false;
  if (mp.role === "client" && mp.mode === "peerjs") {
    mp.clientConnectPending = false;
    if (type === "peer-unavailable") {
      mp.error = "Хост офлайн. Повторное подключение…";
      setTimeout(() => ensureConnectivity(activeSetupConnection), 1000);
      return;
    }
    if (type === "network" || type === "server-error" || type === "socket-error") {
      setTimeout(() => ensureConnectivity(activeSetupConnection), 1000);
    }
  }
  mp.error = describePeerError(err);
}

export function connectToHost(peer, room, setupConnection) {
  const mp = state.multiplayer;
  if (!mp || mp.peer !== peer || !peer.open) return;
  if (mp.connections.size > 0 || mp.clientConnectPending) return;
  mp.clientConnectPending = true;
  mp.hostConnectAttempts += 1;
  mp.lastHostConnectAt = Date.now();
  let conn = null;
  try {
    conn = peer.connect(room);
  } catch (e) {
    mp.clientConnectPending = false;
    mp.error = "Не удалось подключиться к комнате";
    return;
  }
  setupConnection(conn, false);
  const clear = () => {
    if (state.multiplayer.peer === peer) {
      state.multiplayer.clientConnectPending = false;
    }
  };
  conn.on("open", clear);
  conn.on("error", clear);
  setTimeout(clear, 5000);
}

function tryConnectHost(setupConnection) {
  const mp = state.multiplayer;
  if (!mp || mp.role !== "client" || mp.mode !== "peerjs") return;
  if (mp.connections.size > 0 || mp.clientConnectPending) return;
  if (!mp.peer || !mp.peer.open || mp.peer.destroyed || !mp.roomId) return;
  if (mp.hostConnectAttempts >= 12) {
    mp.error = "Не удалось подключиться к хосту. Проверьте, что игра у хоста открыта";
    return;
  }
  const now = Date.now();
  if (now - (mp.lastHostConnectAt || 0) < 3000) return;
  mp.error = "Хост недоступен. Повторное подключение…";
  connectToHost(mp.peer, mp.roomId, setupConnection);
}

export function ensureConnectivity(setupConnection) {
  const mp = state.multiplayer;
  if (!mp || mp.mode !== "peerjs" || mp.role === "none") return;
  if (document.visibilityState === "hidden") return;
  const peer = mp.peer;
  if (!peer || peer.destroyed) return;
  if (peer.disconnected) {
    schedulePeerReconnect(peer, 0);
    return;
  }
  if (mp.role === "client") tryConnectHost(setupConnection);
}

function handleVisibility() {
  if (document.visibilityState === "hidden") return;
  const mp = state.multiplayer;
  if (!mp || mp.mode !== "peerjs") return;
  mp.peerReconnectAttempts = 0;
  mp.hostConnectAttempts = 0;
  ensureConnectivity(activeSetupConnection);
}

export function startReconnectWatcher(setupConnection) {
  activeSetupConnection = setupConnection;
  if (watcherStarted) return;
  watcherStarted = true;
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pageshow", handleVisibility);
  window.addEventListener("focus", handleVisibility);
  window.addEventListener("online", handleVisibility);
  setInterval(() => ensureConnectivity(activeSetupConnection), 2500);
}
