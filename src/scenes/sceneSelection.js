import { SCENE_MAIN, SCENE_URL_PARAM } from "../constants.js";
import { SCENE_CATALOG } from "./sceneCatalog.js";

export function isValidSceneId(id) {
  return SCENE_CATALOG.some((entry) => entry.id === id);
}

export function parseSceneId(search) {
  const params = new URLSearchParams(search == null ? "" : search);
  const id = params.get(SCENE_URL_PARAM);
  if (isValidSceneId(id)) return id;
  return SCENE_MAIN;
}

export function buildSceneSearch(search, id) {
  const params = new URLSearchParams(search == null ? "" : search);
  if (isValidSceneId(id)) params.set(SCENE_URL_PARAM, id);
  else params.set(SCENE_URL_PARAM, SCENE_MAIN);
  return "?" + params.toString();
}

export function resolveInitialSceneId() {
  const search = typeof window !== "undefined" && window.location ? window.location.search : "";
  return parseSceneId(search);
}

export function selectScene(id) {
  if (!isValidSceneId(id)) return false;
  if (typeof window === "undefined" || !window.location) return false;
  const search = buildSceneSearch(window.location.search, id);
  const url = new URL(window.location.href);
  url.search = search;
  window.location.assign(url.toString());
  return true;
}
