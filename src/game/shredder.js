import * as THREE from "three";
import { state } from "../state.js";
import {
  PIT_CENTER_X,
  PIT_CENTER_Z,
  PIT_HALF_X,
  PIT_HALF_Z,
  SHRED_TRIGGER_DEPTH,
  SHRED_REMOVE_DEPTH,
  SHRED_ABSORB_GAP_Z,
  SHRED_FUNNEL_BLEND,
  SHRED_FUNNEL_SINK,
  SHRED_FUNNEL_STEER,
  SHRED_PLAYER_ESCAPE_DEPTH,
} from "../constants.js";
import { setBodyVelocity } from "../physics/helpers.js";
import { absorbObject } from "./projectiles.js";
import { burstShredConfetti } from "../fx/confetti.js";
import { forEachPlayerBody, respawnPlayer, respawnPlayerBody } from "./player.js";

const confettiColor = new THREE.Color();

function insidePit(x, z) {
  const dx = x - PIT_CENTER_X;
  const dz = z - PIT_CENTER_Z;
  return Math.abs(dx) <= PIT_HALF_X && Math.abs(dz) <= PIT_HALF_Z;
}

export function updateShredder(dt) {
  for (const object of state.objects) {
    if (object.exploded || object.absorbed || object.stuckTo) continue;

    const p = object.body.GetPosition();
    const x = p.GetX();
    const y = p.GetY();
    const z = p.GetZ();
    if (!insidePit(x, z)) continue;
    if (y > SHRED_TRIGGER_DEPTH) continue;

    const dz = z - PIT_CENTER_Z;
    if (y <= SHRED_REMOVE_DEPTH || Math.abs(dz) <= SHRED_ABSORB_GAP_Z) {
      object.instanceMesh.getColorAt(object.instanceIndex, confettiColor);
      burstShredConfetti(x, z, confettiColor.getHex());
      absorbObject(object);
      continue;
    }

    const v = state.bodyInterface.GetLinearVelocity(object.id);
    const vx = v.GetX();
    const vy = v.GetY();
    const vz = v.GetZ();

    const steerX = (PIT_CENTER_X - x) * SHRED_FUNNEL_STEER;
    const steerZ = (PIT_CENTER_Z - z) * SHRED_FUNNEL_STEER;
    const targetX = THREE.MathUtils.clamp(steerX, -2.2, 2.2);
    const targetZ = THREE.MathUtils.clamp(steerZ, -2.2, 2.2);

    const blend = 1 - Math.exp(-SHRED_FUNNEL_BLEND * dt);
    setBodyVelocity(
      object.id,
      vx + (targetX - vx) * blend,
      vy + (SHRED_FUNNEL_SINK - vy) * blend,
      vz + (targetZ - vz) * blend
    );
    state.bodyInterface.ActivateBody(object.id);
  }

  forEachPlayerBody((body, bodyId, peerId) => {
    const p = body.GetPosition();
    const x = p.GetX();
    const y = p.GetY();
    const z = p.GetZ();
    if (!insidePit(x, z) || y >= SHRED_PLAYER_ESCAPE_DEPTH) return;
    if (peerId) respawnPlayerBody(bodyId);
    else respawnPlayer();
  });
}
