import { state } from "../state.js";
import {
  LAKE_PILE_CENTER_X,
  LAKE_PILE_CENTER_Z,
  LAKE_PILE_RADIUS,
} from "../constants.js";
import { createObject } from "./objects.js";
import { createTypeMesh, finalizeTypeMesh } from "./objectMeshes.js";
import { worldRandom } from "./worldRandom.js";
import { TYPE_CONFIG } from "../graphics/objectAssets.js";
import { lakeHeight } from "../scenes/lake/terrainMath.js";
import { settlePile } from "./world.js";
import { updateStats, updateRemovedCounter } from "../ui/hud.js";

const LAKE_TRASH_LAYERS = 6;
const LAKE_TRASH_BASE_OFFSET = 0.25;
const LAKE_TRASH_LAYER_HEIGHT = 0.55;

const LAKE_TRASH_SHARES = {
  box: 37,
  sphere: 27,
  capsule: 23,
  wire: 23,
  pipe: 17,
  frame: 13,
};

const LAKE_TRASH_TYPES = ["box", "sphere", "capsule", "wire", "pipe", "frame"];

export function spawnLakeTrash() {
  for (const type of LAKE_TRASH_TYPES) {
    const count = LAKE_TRASH_SHARES[type];
    const config = TYPE_CONFIG[type];
    const mesh = createTypeMesh(type, count);
    for (let i = 0; i < count; i++) {
      const angle = worldRandom() * Math.PI * 2;
      const radius = Math.sqrt(worldRandom()) * LAKE_PILE_RADIUS;
      const x = LAKE_PILE_CENTER_X + Math.cos(angle) * radius;
      const z = LAKE_PILE_CENTER_Z + Math.sin(angle) * radius;
      const layer = Math.max(
        0,
        Math.floor((1 - radius / LAKE_PILE_RADIUS) * LAKE_TRASH_LAYERS)
      );
      const baseY =
        lakeHeight(x, z) +
        LAKE_TRASH_BASE_OFFSET +
        layer * LAKE_TRASH_LAYER_HEIGHT;
      createObject(type, i, mesh, config.palette, x, z, baseY, false);
    }
    finalizeTypeMesh(mesh);
  }

  state.totalObjects = state.objects.length;
  state.ufoQueue = null;
  state.ufoReleased = 0;
  state.ufoTimer = 0;
  state.ufoActive = false;
  settlePile(180);
  updateStats();
  updateRemovedCounter(true);
}