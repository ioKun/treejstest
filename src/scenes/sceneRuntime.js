import { SCENE_MAIN } from "../constants.js";

export const sceneRuntime = {
  id: SCENE_MAIN,
  fixedUpdate: null,
  frameUpdate: null,
  animatePlayer: null,
};

export function setSceneRuntime(runtime) {
  const r = runtime || {};
  if (r.id !== undefined) sceneRuntime.id = r.id;
  if (r.fixedUpdate !== undefined) sceneRuntime.fixedUpdate = r.fixedUpdate;
  if (r.frameUpdate !== undefined) sceneRuntime.frameUpdate = r.frameUpdate;
  if (r.animatePlayer !== undefined) sceneRuntime.animatePlayer = r.animatePlayer;
}

export function runSceneFixed(dt) {
  if (typeof sceneRuntime.fixedUpdate === "function") sceneRuntime.fixedUpdate(dt);
}

export function runSceneFrame(dt) {
  if (typeof sceneRuntime.frameUpdate === "function") sceneRuntime.frameUpdate(dt);
}

export function runPlayerVisual(dt) {
  if (typeof sceneRuntime.animatePlayer === "function") sceneRuntime.animatePlayer(dt);
}
