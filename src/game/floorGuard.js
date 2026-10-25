import { state } from "../state.js";
import {
  PIT_CENTER_X,
  PIT_CENTER_Z,
  PIT_HALF_X,
  PIT_HALF_Z,
  FLOOR_GUARD_DEPTH,
  FLOOR_GUARD_INTERVAL,
  FLOOR_GUARD_PLAYER_DEPTH,
} from "../constants.js";
import { forEachPlayerBody, respawnPlayer, respawnPlayerBody } from "./player.js";
import { vanishObject } from "./projectiles.js";

let timer = 0;

function insidePit(x, z) {
  return (
    x > PIT_CENTER_X - PIT_HALF_X &&
    x < PIT_CENTER_X + PIT_HALF_X &&
    z > PIT_CENTER_Z - PIT_HALF_Z &&
    z < PIT_CENTER_Z + PIT_HALF_Z
  );
}

export function updateFloorGuard(dt) {
  timer += dt;
  if (timer < FLOOR_GUARD_INTERVAL) return;
  timer = 0;

  for (const object of state.objects) {
    if (object.exploded || object.absorbed) continue;
    const p = object.body.GetPosition();
    if (p.GetY() >= FLOOR_GUARD_DEPTH) continue;
    if (insidePit(p.GetX(), p.GetZ())) continue;
    vanishObject(object, p.GetX(), 0, p.GetZ());
  }

  forEachPlayerBody((body, bodyId, peerId) => {
    if (body.GetPosition().GetY() >= FLOOR_GUARD_PLAYER_DEPTH) return;
    if (peerId) respawnPlayerBody(bodyId);
    else respawnPlayer();
  });
}
