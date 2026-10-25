import { state } from "../state.js";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.sipnet.ru:3478" },
  { urls: "stun:stun.antisip.com:3478" },
  { urls: "stun:stun.nextcloud.com:443" },
];

function encodeSdp(sdp) {
  const bytes = new TextEncoder().encode(sdp);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeSdp(token) {
  let value = String(token || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

function waitForIce(pc, timeout = 5000) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, timeout);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export async function createManualOffer() {
  const pc = createPeerConnection();
  const channel = pc.createDataChannel("game", { ordered: true });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIce(pc);
  return { pc, channel, token: encodeSdp(pc.localDescription.sdp) };
}

export async function createManualAnswer(token) {
  const pc = createPeerConnection();
  await pc.setRemoteDescription({ type: "offer", sdp: decodeSdp(token) });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIce(pc);
  return { pc, token: encodeSdp(pc.localDescription.sdp) };
}

export async function applyManualAnswer(pc, token) {
  await pc.setRemoteDescription({ type: "answer", sdp: decodeSdp(token) });
}

export function buildManualLink(token) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("manual", token);
  return url.toString();
}

export function readManualToken(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const token = url.searchParams.get("manual");
    if (token) return token;
  } catch (e) {}
  return text;
}

export function createChannelConnection(channel, peerId) {
  const listeners = { open: [], data: [], close: [], error: [] };
  let open = channel.readyState === "open";
  const emit = (event, arg) => {
    for (const cb of listeners[event] || []) cb(arg);
  };
  const conn = {
    peer: peerId,
    send(message) {
      if (channel.readyState === "open") channel.send(JSON.stringify(message));
    },
    close() {
      try { channel.close(); } catch (e) {}
    },
    on(event, cb) {
      (listeners[event] ||= []).push(cb);
      if (event === "open" && open) cb();
    },
  };

  channel.onopen = () => {
    open = true;
    emit("open");
  };
  channel.onmessage = (event) => {
    let data = event.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) {}
    }
    emit("data", data);
  };
  channel.onclose = () => emit("close");
  channel.onerror = (event) => emit("error", event);

  return conn;
}

const DEFAULT_NAME = "Игрок";

function randomId() {
  return "manual-" + Math.random().toString(36).slice(2, 10);
}

function watchPeerConnection(pc) {
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      state.multiplayer.error = "P2P-соединение не установлено (NAT/STUN)";
    }
  };
}

export async function startManualHost(name, setupConnection) {
  const roomId = randomId();
  state.multiplayer.mode = "manual";
  state.multiplayer.role = "host";
  state.multiplayer.roomId = roomId;
  state.multiplayer.peerId = roomId;
  state.multiplayer.localName = name || DEFAULT_NAME;
  state.multiplayer.connected = false;
  state.multiplayer.peers = [{ id: roomId, name: state.multiplayer.localName, isHost: true }];
  state.multiplayer.remoteBodies = new Map();
  state.multiplayer.remoteBodyIds = new Map();
  state.multiplayer.remoteHeld = new Map();
  state.multiplayer.inputs = new Map();
  state.multiplayer.worldReady = true;
  state.multiplayer.lastWorldTotal = state.totalObjects;
  state.multiplayer.lastWorldSpawnMode = state.spawnMode;
  state.multiplayer.lastLevelStart = state.levelStartTime;
  state.multiplayer.manualAnswer = null;
  const { pc, channel, token } = await createManualOffer();
  watchPeerConnection(pc);
  state.multiplayer.manualPc = pc;
  state.multiplayer.manualLink = buildManualLink(token);
  const conn = createChannelConnection(channel, "guest");
  setupConnection(conn, true);
  return state.multiplayer.manualLink;
}

export async function startManualGuest(token, name, setupConnection) {
  state.multiplayer.mode = "manual";
  state.multiplayer.role = "client";
  state.multiplayer.roomId = "manual";
  state.multiplayer.peerId = "guest";
  state.multiplayer.localName = name || DEFAULT_NAME;
  state.multiplayer.connected = false;
  state.multiplayer.worldReady = false;
  state.multiplayer.manualAnswer = null;
  const { pc, token: answerToken } = await createManualAnswer(token);
  watchPeerConnection(pc);
  state.multiplayer.manualPc = pc;
  state.multiplayer.manualAnswer = answerToken;
  pc.ondatachannel = (event) => {
    const conn = createChannelConnection(event.channel, "host");
    setupConnection(conn, false);
  };
  return answerToken;
}

