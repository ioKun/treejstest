export const DEFAULT_PEER_CONFIG = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  key: "peerjs",
  secure: true,
};

const STORAGE_KEY = "mp_peer_config";

export function normalizePeerConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const port = Number(source.port);
  const host = String(source.host || DEFAULT_PEER_CONFIG.host)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  const path = String(source.path || DEFAULT_PEER_CONFIG.path).trim() || "/";
  return {
    host: host || DEFAULT_PEER_CONFIG.host,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PEER_CONFIG.port,
    path: path.startsWith("/") ? path : "/" + path,
    key: String(source.key || DEFAULT_PEER_CONFIG.key).trim() || DEFAULT_PEER_CONFIG.key,
    secure:
      source.secure === undefined
        ? DEFAULT_PEER_CONFIG.secure
        : source.secure === true || source.secure === "1" || source.secure === "true",
  };
}

export function loadPeerConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PEER_CONFIG };
    return normalizePeerConfig(JSON.parse(raw));
  } catch (e) {
    return { ...DEFAULT_PEER_CONFIG };
  }
}

export function savePeerConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePeerConfig(config)));
  } catch (e) {}
}

export function peerOptions(config) {
  const normalized = normalizePeerConfig(config);
  return {
    host: normalized.host,
    port: normalized.port,
    path: normalized.path,
    key: normalized.key,
    secure: normalized.secure,
    debug: 0,
  };
}

export function addPeerConfigToUrl(url, config) {
  const normalized = normalizePeerConfig(config);
  url.searchParams.set("peerhost", normalized.host);
  url.searchParams.set("peerport", String(normalized.port));
  url.searchParams.set("peerpath", normalized.path);
  url.searchParams.set("peerkey", normalized.key);
  url.searchParams.set("peersecure", normalized.secure ? "1" : "0");
  return url;
}

export function readPeerConfigFromParams(params) {
  if (!params || !params.get("peerhost")) return null;
  return normalizePeerConfig({
    host: params.get("peerhost"),
    port: params.get("peerport"),
    path: params.get("peerpath"),
    key: params.get("peerkey"),
    secure: params.get("peersecure") === "1",
  });
}
