import * as THREE from "three";
import { engine } from "./engine.js";
import { state, playerVel, tmpMatrix } from "./state.js";
import { FIXED_DT, MAX_SUBSTEPS } from "./constants.js";
import { readPlayerState } from "./physics/helpers.js";
import { updatePlayer, updateHeld } from "./game/player.js";
import {
  updateArmed,
  updateBlackHoles,
  updateTornadoes,
  updatePortals,
} from "./game/projectiles.js";
import { updateStickyCapsules } from "./game/capsule.js";
import { updateShredder } from "./game/shredder.js";
import { updateShredderShafts } from "./physics/shredder.js";
import { updateShredderVisual } from "./graphics/shredder.js";
import { animateLimbs } from "./graphics/stickman.js";
import { updateCamera } from "./graphics/renderer.js";
import { updateExplosionFx } from "./fx/explosion.js";
import { updateBlackHoleFx } from "./fx/blackhole.js";
import { updateTornadoFx } from "./fx/tornado.js";
import { updatePortalFx } from "./fx/portal.js";
import { updateHighlight, updateRemovedCounter } from "./ui/hud.js";

let clock = null;
let accumulator = 0;

export function restartClock() {
  clock = new THREE.Timer();
  clock.connect(document);
  clock.update();
  accumulator = 0;
}

function dampAngle(current, target, lambda, dt) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export function syncMeshes() {
  for (const object of state.objects) {
    if (object.exploded || object.absorbed) continue;

    const p = object.body.GetPosition();
    const q = object.body.GetRotation();
    object.position.set(p.GetX(), p.GetY(), p.GetZ());
    object.quaternion.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
    tmpMatrix.compose(object.position, object.quaternion, object.scale);
    object.instanceMesh.setMatrixAt(object.instanceIndex, tmpMatrix);
  }

  for (const type of Object.keys(state.instances)) {
    state.instances[type].instanceMatrix.needsUpdate = true;
  }

  const p = state.playerBody.GetPosition();
  state.playerRoot.position.set(p.GetX(), p.GetY(), p.GetZ());

  const speed = Math.hypot(playerVel.x, playerVel.z);
  const moving = speed > 0.35;

  if (state.held) {
    const targetAngle = Math.atan2(-Math.sin(state.yaw), -Math.cos(state.yaw));
    state.facing = dampAngle(state.facing, targetAngle, 10, FIXED_DT);
  } else if (moving) {
    const targetAngle = Math.atan2(playerVel.x, playerVel.z);
    state.facing = dampAngle(state.facing, targetAngle, 12, FIXED_DT);
  }

  state.playerRoot.rotation.y = state.facing;
}

function fixedUpdate() {
  updatePlayer(FIXED_DT);
  updateHeld(FIXED_DT);
  updateArmed(FIXED_DT);
  updateBlackHoles(FIXED_DT);
  updateTornadoes(FIXED_DT);
  updatePortals(FIXED_DT);
  updateShredder(FIXED_DT);
  updateShredderShafts();
  state.jolt.Step(FIXED_DT, 1);
  updateStickyCapsules();
}

export function animate() {
  requestAnimationFrame(animate);
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.1);
  accumulator += dt;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    fixedUpdate();
    accumulator -= FIXED_DT;
    steps++;
  }

  if (steps === MAX_SUBSTEPS) accumulator = 0;

  const fxDt = Math.min(dt, 0.05);
  readPlayerState();
  syncMeshes();
  animateLimbs(fxDt);
  updateExplosionFx(fxDt);
  updateBlackHoleFx(fxDt);
  updateTornadoFx(fxDt);
  updatePortalFx(fxDt);
  updateShredderVisual(fxDt);
  updateCamera();
  updateHighlight();

  if (state.skyTexture) {
    engine.scene.backgroundRotation.y += dt * 0.004;
  }
  updateRemovedCounter();

  engine.renderer.render(engine.scene, engine.camera);
}
