import { state } from "../state.js";
import { SCENE_MAIN } from "../constants.js";
import { engine } from "../engine.js";
import { initGraphics } from "../graphics/renderer.js";
import { setWorldSeed } from "../physics/worldRandom.js";
import {
  buildGroundPhysics,
  createPlayerBody,
  spawnObjects,
  settlePile,
} from "../physics/world.js";
import { buildShredderPhysics } from "../physics/shredder.js";
import { buildStickman, animateLimbs } from "../graphics/stickman.js";
import { initUfoVisual } from "../graphics/ufo.js";
import { initMenu } from "../ui/menu.js";
import { initVictory } from "../ui/victory.js";
import { autoJoinFromUrl } from "../network/index.js";
import { setSceneRuntime } from "./sceneRuntime.js";

export async function startMainScene() {
  state.sceneId = SCENE_MAIN;
  initGraphics();
  setWorldSeed(state.worldSeed);
  buildGroundPhysics();
  buildShredderPhysics();
  buildStickman();
  initUfoVisual(engine.scene);
  createPlayerBody();
  spawnObjects();
  state.totalObjects = state.objects.length;
  settlePile();
  initMenu();
  initVictory();
  autoJoinFromUrl();
  setSceneRuntime({ id: SCENE_MAIN, animatePlayer: animateLimbs });
}
