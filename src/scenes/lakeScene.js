import { state } from "../state.js";
import { engine } from "../engine.js";
import {
  SCENE_LAKE,
  PLAYER_HALF_TOTAL,
  LAKE_PLAYER_SPAWN_X,
  LAKE_PLAYER_SPAWN_Z,
  LAKE_SPAWN_CLEARANCE,
  LAKE_WATER_LEVEL,
  LAKE_OUT_OF_BOUNDS_RADIUS,
  LAKE_OBJECT_RESET_DEPTH,
} from "../constants.js";
import { initRendererCore } from "../graphics/renderer.js";
import { initLakeEnvironment } from "../graphics/lakeEnvironment.js";
import { initLakeWater } from "../graphics/lakeWater.js";
import { initLakeFlora } from "../graphics/lakeFlora.js";
import { addHighlightMesh } from "../graphics/highlight.js";
import { buildLakeTerrainPhysics } from "../physics/lakeTerrain.js";
import { createPlayerBody } from "../physics/world.js";
import { respawnPlayer } from "../game/player.js";
import { spawnLakeTrash } from "../physics/lakeTrash.js";
import { buildRobotPlayer, animateRobot } from "../graphics/robot.js";
import { initMenu } from "../ui/menu.js";
import { setSceneRuntime } from "./sceneRuntime.js";
import { lakeHeight } from "./lake/terrainMath.js";
import { updateLakeEnvironment } from "../graphics/lakeEnvironment.js";
import { updateLakeWater } from "../graphics/lakeWater.js";
import { updateLakeFlora } from "../graphics/lakeFlora.js";

function updateLakeVisuals(dt) {
  updateLakeEnvironment(dt);
  updateLakeWater(dt);
  updateLakeFlora(dt);
}

function updateLakeFixed(dt) {
  const J = state.J;
  const bi = state.bodyInterface;

  const pp = state.playerBody.GetPosition();
  const px = pp.GetX();
  const py = pp.GetY();
  const pz = pp.GetZ();
  if (Math.hypot(px, pz) > LAKE_OUT_OF_BOUNDS_RADIUS || py < LAKE_WATER_LEVEL - 0.8) {
    respawnPlayer();
  }

  for (const object of state.objects) {
    if (object.exploded || object.absorbed) continue;
    const p = object.body.GetPosition();
    const oy = p.GetY();
    const ox = p.GetX();
    const oz = p.GetZ();
    if (oy >= LAKE_OBJECT_RESET_DEPTH && Math.hypot(ox, oz) <= LAKE_OUT_OF_BOUNDS_RADIUS) continue;

    if (state.held === object) {
      state.held = null;
    }
    bi.SetGravityFactor(object.id, 1);
    state.tmpRVec3.Set(object.spawnPosition.x, object.spawnPosition.y, object.spawnPosition.z);
    state.tmpQuat.Set(object.spawnRotation.x, object.spawnRotation.y, object.spawnRotation.z, object.spawnRotation.w);
    bi.SetPositionAndRotation(object.id, state.tmpRVec3, state.tmpQuat, J.EActivation_Activate);
    bi.SetLinearAndAngularVelocity(object.id, state.zeroVec3, state.zeroVec3);
    bi.ActivateBody(object.id);
  }
}

export async function startLakeScene() {
  state.sceneId = SCENE_LAKE;
  state.skyTexture = null;
  document.body.classList.add("scene-lake");

  initRendererCore();
  initLakeEnvironment();
  initLakeWater();
  initLakeFlora();

  addHighlightMesh();
  buildLakeTerrainPhysics();

  state.playerSpawn.set(
    LAKE_PLAYER_SPAWN_X,
    lakeHeight(LAKE_PLAYER_SPAWN_X, LAKE_PLAYER_SPAWN_Z) +
      PLAYER_HALF_TOTAL +
      LAKE_SPAWN_CLEARANCE,
    LAKE_PLAYER_SPAWN_Z
  );

  createPlayerBody();
  buildRobotPlayer();

  spawnLakeTrash();

  setSceneRuntime({ id: SCENE_LAKE, fixedUpdate: updateLakeFixed, frameUpdate: updateLakeVisuals, animatePlayer: animateRobot });

  initMenu();
}
