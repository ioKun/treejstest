import { SCENE_MAIN, SCENE_LAKE } from "../constants.js";
import { startMainScene } from "./mainScene.js";
import { startLakeScene } from "./lakeScene.js";

export async function startScene(id) {
  if (id === SCENE_LAKE) return startLakeScene();
  return startMainScene();
}
