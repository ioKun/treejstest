import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import {
  FIXED_DT,
  GROUND_HALF_SIZE,
  LAYER_NON_MOVING,
  LAYER_MOVING,
  PIT_CENTER_X,
  PIT_CENTER_Z,
  PIT_HALF_X,
  PIT_HALF_Z,
  PLAYER_SPAWN_Y,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
  PILE_CENTER_Z,
  PILE_BASE_RADIUS,
  PILE_LAYERS,
  PILE_LAYER_SHRINK,
  PILE_LAYER_HEIGHT,
  PILE_CELL,
  PILE_JITTER,
  SETTLE_ACTIVE_LIMIT,
  SETTLE_ACTIVE_SPEED,
  SETTLE_CHECK_INTERVAL,
  SETTLE_MAX_STEPS,
} from "../constants.js";
import { readPlayerState } from "./helpers.js";
import { createObject } from "./objects.js";
import { TYPE_CONFIG } from "../graphics/objectAssets.js";

export function buildGroundPhysics() {
  const J = state.J;
  const side = GROUND_HALF_SIZE;

  const strips = computeGroundStrips();

  for (const strip of strips) {
    const shape = new J.BoxShape(
      new J.Vec3(strip.hx, 0.5, strip.hz),
      0.02
    );
    const position = new J.RVec3(strip.cx, -0.5, strip.cz);
    const rotation = new J.Quat(0, 0, 0, 1);
    const settings = new J.BodyCreationSettings(
      shape,
      position,
      rotation,
      J.EMotionType_Static,
      LAYER_NON_MOVING
    );
    settings.mFriction = 0.9;
    settings.mRestitution = 0;

    const body = state.bodyInterface.CreateBody(settings);
    J.destroy(settings);
    J.destroy(position);
    J.destroy(rotation);
    state.bodyInterface.AddBody(body.GetID(), J.EActivation_Activate);
  }
}

export function computeGroundStrips() {
  const half = GROUND_HALF_SIZE;
  const px = PIT_CENTER_X;
  const pz = PIT_CENTER_Z;
  const hx = PIT_HALF_X;
  const hz = PIT_HALF_Z;

  const northLength = half - (pz + hz);
  const southLength = pz - hz + half;
  const sideLength = 2 * hz;

  return [
    {
      cx: 0,
      cz: pz + hz + northLength / 2,
      hx: half,
      hz: northLength / 2,
    },
    {
      cx: 0,
      cz: -half + southLength / 2,
      hx: half,
      hz: southLength / 2,
    },
    {
      cx: -half + (half + px - hx) / 2,
      cz: pz,
      hx: (half + px - hx) / 2,
      hz: sideLength / 2,
    },
    {
      cx: px + hx + (half - (px + hx)) / 2,
      cz: pz,
      hx: (half - (px + hx)) / 2,
      hz: sideLength / 2,
    },
  ];
}

export function createPlayerBody() {
  const J = state.J;
  const shape = new J.CapsuleShape(PLAYER_HALF_HEIGHT, PLAYER_RADIUS);
  shape.SetDensity(340);

  const position = new J.RVec3(0, PLAYER_SPAWN_Y, 0);
  const rotation = new J.Quat(0, 0, 0, 1);
  const settings = new J.BodyCreationSettings(
    shape,
    position,
    rotation,
    J.EMotionType_Dynamic,
    LAYER_MOVING
  );
  settings.mAllowedDOFs =
    J.EAllowedDOFs_TranslationX |
    J.EAllowedDOFs_TranslationY |
    J.EAllowedDOFs_TranslationZ;
  settings.mAllowSleeping = false;
  settings.mFriction = 0.25;
  settings.mRestitution = 0;
  settings.mLinearDamping = 0;
  settings.mAngularDamping = 0;
  settings.mMaxLinearVelocity = 40;

  const body = state.bodyInterface.CreateBody(settings);
  J.destroy(settings);
  J.destroy(position);
  J.destroy(rotation);

  state.playerBody = body;
  state.playerId = body.GetID();
  state.bodyInterface.AddBody(state.playerId, J.EActivation_Activate);
  state.ignorePlayerFilter = new J.IgnoreSingleBodyFilter(state.playerId);
}

function buildPileCells() {
  const cells = [];

  for (let layer = 0; layer < PILE_LAYERS; layer++) {
    const radius = PILE_BASE_RADIUS - layer * PILE_LAYER_SHRINK;
    const layerY = layer * PILE_LAYER_HEIGHT;

    for (let x = -radius; x <= radius; x += PILE_CELL) {
      for (let z = -radius; z <= radius; z += PILE_CELL) {
        const cx = x + PILE_CELL / 2 + (Math.random() - 0.5) * PILE_JITTER * 2;
        const cz = z + PILE_CELL / 2 + (Math.random() - 0.5) * PILE_JITTER * 2;
        if (cx * cx + cz * cz > radius * radius) continue;
        cells.push({ x: cx, z: PILE_CENTER_Z + cz, y: layerY });
      }
    }
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = cells[i];
    cells[i] = cells[j];
    cells[j] = tmp;
  }

  return cells;
}

export function spawnObjects() {
  const cells = buildPileCells();
  let cellCursor = 0;

  for (const [type, config] of Object.entries(TYPE_CONFIG)) {
    const geometry = config.geometry();
    const material = config.material();
    const mesh = new THREE.InstancedMesh(geometry, material, config.count);

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.name = type;

    engine.scene.add(mesh);
    state.instances[type] = mesh;

    for (let i = 0; i < config.count; i++) {
      let cell = cells[cellCursor++];

      if (!cell) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * PILE_BASE_RADIUS;
        cell = {
          x: Math.cos(angle) * distance,
          z: PILE_CENTER_Z + Math.sin(angle) * distance,
          y: Math.floor(Math.random() * PILE_LAYERS) * PILE_LAYER_HEIGHT,
        };
      }

      createObject(type, i, mesh, config.palette, cell.x, cell.z, cell.y);
    }

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function isPileCalm() {
  let active = 0;

  for (const object of state.objects) {
    if (!object.body.IsActive()) continue;

    const v = state.bodyInterface.GetLinearVelocity(object.id);
    if (
      Math.hypot(v.GetX(), v.GetY(), v.GetZ()) > SETTLE_ACTIVE_SPEED
    ) {
      return false;
    }
    active++;
  }

  return active < SETTLE_ACTIVE_LIMIT;
}

export function settlePile() {
  for (let i = 0; i < SETTLE_MAX_STEPS; i++) {
    state.jolt.Step(FIXED_DT, 1);
    if (
      (i + 1) % SETTLE_CHECK_INTERVAL === 0 &&
      isPileCalm()
    ) {
      break;
    }
  }

  for (const object of state.objects) {
    const p = object.body.GetPosition();
    const q = object.body.GetRotation();
    object.spawnPosition.set(p.GetX(), p.GetY(), p.GetZ());
    object.spawnRotation.set(
      q.GetX(),
      q.GetY(),
      q.GetZ(),
      q.GetW()
    );
    object.position.copy(object.spawnPosition);
    object.quaternion.copy(object.spawnRotation);
    state.bodyInterface.SetLinearAndAngularVelocity(
      object.id,
      state.zeroVec3,
      state.zeroVec3
    );
    state.bodyInterface.DeactivateBody(object.id);
  }

  readPlayerState();
}
