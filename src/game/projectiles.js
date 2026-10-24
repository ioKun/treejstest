import * as THREE from "three";
import { state, playerPos, tmpColor, tmpMatrix } from "../state.js";
import {
  LAYER_PORTAL,
  BLAST_RADIUS,
  BLAST_SPEED,
  GROUND_HALF_SIZE,
  GROUND_EDGE_MARGIN,
  PORTAL_CAPTURE_HEIGHT,
  PORTAL_REMOVE_DEPTH,
  PORTAL_RADIUS,
  SPECIAL_FUSE,
  TORNADO_HEIGHT,
  TORNADO_RADIUS,
  TORNADO_VELOCITY_BLEND,
  BLACKHOLE_ABSORB_RADIUS,
  BLACKHOLE_ABSORB_RATE,
  BLACKHOLE_PULL,
  BLACKHOLE_VELOCITY_BLEND,
  BLACKHOLE_SWIRL,
  TORNADO_LIFT,
  TORNADO_PULL,
  TORNADO_SWIRL,
} from "../constants.js";
import { spawnBlackHole } from "../fx/blackhole.js";
import { sendEvent } from "../network/index.js";
import { spawnPortal, deactivatePortal } from "../fx/portal.js";
import { spawnTornado, deactivateTornado } from "../fx/tornado.js";
import { spawnExplosion } from "../fx/explosion.js";
import { releaseStuckObjects } from "./capsule.js";

function hideObjectInstance(object) {
  tmpMatrix.makeScale(0, 0, 0);
  object.instanceMesh.setMatrixAt(object.instanceIndex, tmpMatrix);
  object.instanceMesh.instanceMatrix.needsUpdate = true;
}

export function vanishObject(object, x, y, z, force = false) {
  if (!force && state.multiplayer.role === "client" && state.multiplayer.connected) return;
  if (object.stuckTo) {
    const capsule = object.stuckTo;
    const idx = capsule.stuckObjects.indexOf(object);
    if (idx !== -1) capsule.stuckObjects.splice(idx, 1);
    object.stuckTo = null;
    object.stuckOffset = null;
    object.stuckRotation = null;
  }

  if (object.sticky && object.grownShape) {
    object.grownShape.Release();
    object.grownShape = null;
    object.sticky = false;
  }

  if (object.stuckObjects && object.stuckObjects.length) {
    releaseStuckObjects(object);
  }

  object.position.set(x, y, z);
  state.bodyInterface.RemoveBody(object.id);
  object.exploded = true;
  object.fuse = 0;
  if (!(force && state.multiplayer.role === "client")) state.removed += 1;
  hideObjectInstance(object);
}

export function armObject(object) {
  if (object.exploded || object.absorbed) return;
  if (
    object.type !== "sphere" &&
    object.type !== "box" &&
    object.type !== "frame" &&
    object.type !== "gear"
  ) {
    return;
  }
  object.fuse = SPECIAL_FUSE;
  if (!state.armed.includes(object)) state.armed.push(object);
}

export function updateArmed(dt) {
  for (let i = state.armed.length - 1; i >= 0; i--) {
    const object = state.armed[i];

    if (object.exploded || object.absorbed) {
      state.armed.splice(i, 1);
      continue;
    }

    object.fuse -= dt;

    if (object.fuse > 0) continue;

    state.armed.splice(i, 1);
    if (object.type === "box") createBlackHole(object);
    else if (object.type === "frame") openPortalFromFrame(object);
    else if (object.type === "gear") createTornadoFromGear(object);
    else explodeBall(object);
  }
}

function createBlackHole(object) {
  const p = object.body.GetPosition();
  const x = p.GetX();
  const y = Math.max(0.7, p.GetY());
  const z = p.GetZ();

  vanishObject(object, x, y, z);
  spawnBlackHole(x, y, z);
  sendEvent({ eventType: "effect", effectType: "blackhole", x, y, z, objectKey: object.key, from: state.multiplayer?.peerId });
}

function openPortalFromFrame(object) {
  const p = object.body.GetPosition();
  const limit = GROUND_HALF_SIZE - PORTAL_RADIUS - GROUND_EDGE_MARGIN;
  const x = THREE.MathUtils.clamp(p.GetX(), -limit, limit);
  const z = THREE.MathUtils.clamp(p.GetZ(), -limit, limit);

  object.instanceMesh.getColorAt(object.instanceIndex, tmpColor);
  vanishObject(object, x, 0, z);
  spawnPortal(x, z, tmpColor);
  sendEvent({
    eventType: "effect",
    effectType: "portal",
    x,
    z,
    color: "#" + tmpColor.getHexString(),
    objectKey: object.key,
    from: state.multiplayer?.peerId,
  });
}

function createTornadoFromGear(object) {
  const p = object.body.GetPosition();
  const limit = GROUND_HALF_SIZE - TORNADO_RADIUS - GROUND_EDGE_MARGIN;
  const x = THREE.MathUtils.clamp(p.GetX(), -limit, limit);
  const z = THREE.MathUtils.clamp(p.GetZ(), -limit, limit);

  const velocity = state.bodyInterface.GetLinearVelocity(object.id);
  let dx = velocity.GetX();
  let dz = velocity.GetZ();
  let length = Math.hypot(dx, dz);

  if (length < 0.75 && object.throwDirection) {
    dx = object.throwDirection.x;
    dz = object.throwDirection.z;
    length = Math.hypot(dx, dz);
  }

  if (length < 0.001) {
    dx = -Math.sin(state.yaw);
    dz = -Math.cos(state.yaw);
    length = 1;
  }

  object.instanceMesh.getColorAt(object.instanceIndex, tmpColor);
  vanishObject(object, x, 0, z);
  spawnTornado(x, z, dx / length, dz / length, tmpColor);
  sendEvent({
    eventType: "effect",
    effectType: "tornado",
    x,
    z,
    dx: dx / length,
    dz: dz / length,
    color: "#" + tmpColor.getHexString(),
    objectKey: object.key,
    from: state.multiplayer?.peerId,
  });
}

function explodeBall(object) {
  const p = object.body.GetPosition();
  const x = p.GetX();
  const y = Math.max(0.25, p.GetY());
  const z = p.GetZ();

  vanishObject(object, x, y, z);
  applyBlast(x, y, z);
  spawnExplosion(x, y, z);
  sendEvent({
    eventType: "effect",
    effectType: "explosion",
    x,
    y,
    z,
    objectKey: object.key,
    from: state.multiplayer?.peerId,
  });
}

export function absorbObject(object, force = false) {
  if (!force && state.multiplayer.role === "client" && state.multiplayer.connected) return;
  if (object.absorbed || object.exploded) return;

  if (object.stuckTo) {
    const capsule = object.stuckTo;
    const idx = capsule.stuckObjects.indexOf(object);
    if (idx !== -1) capsule.stuckObjects.splice(idx, 1);
    object.stuckTo = null;
    object.stuckOffset = null;
    object.stuckRotation = null;
  }

  if (object.sticky && object.grownShape) {
    object.grownShape.Release();
    object.grownShape = null;
    object.sticky = false;
  }

  if (object.stuckObjects && object.stuckObjects.length) {
    const attached = object.stuckObjects.slice();
    object.stuckObjects.length = 0;
    for (const stuck of attached) {
      stuck.stuckTo = null;
      stuck.stuckOffset = null;
      stuck.stuckRotation = null;
      absorbObject(stuck, force);
    }
  }

  state.bodyInterface.RemoveBody(object.id);
  object.absorbed = true;
  object.fuse = 0;
  state.removed += 1;

  const index = state.armed.indexOf(object);
  if (index !== -1) state.armed.splice(index, 1);

  hideObjectInstance(object);
}

export function updateBlackHoles(dt) {
  for (const hole of state.blackHoles) {
    if (!hole.active) continue;

    hole.age += dt;
    if (hole.age >= hole.duration) {
      hole.active = false;
      hole.group.visible = false;
      continue;
    }

    const fade =
      Math.min(hole.age / 0.35, 1) *
      Math.min((hole.duration - hole.age) / 0.5, 1);
    const strength = BLACKHOLE_PULL * fade;
    const radiusSq = hole.radius * hole.radius;
    const absorbRadiusSq = BLACKHOLE_ABSORB_RADIUS * BLACKHOLE_ABSORB_RADIUS;
    hole.absorbBudget = Math.min(
      1,
      hole.absorbBudget + dt * BLACKHOLE_ABSORB_RATE
    );

    for (const object of state.objects) {
      if (
        object.exploded ||
        object.absorbed ||
        object.stuckTo ||
        object === state.held
      ) {
        continue;
      }

      const p = object.body.GetPosition();
      const dx = hole.position.x - p.GetX();
      const dy = hole.position.y - p.GetY();
      const dz = hole.position.z - p.GetZ();
      const distanceSq = dx * dx + dy * dy + dz * dz;

      if (distanceSq > radiusSq) continue;
      if (distanceSq < absorbRadiusSq) {
        if (hole.absorbBudget >= 1) {
          absorbObject(object);
          hole.absorbBudget -= 1;
        }
        continue;
      }

      const inverseMass = object.body.GetMotionProperties().GetInverseMass();
      if (inverseMass <= 0) continue;

      const distance = Math.sqrt(distanceSq) || 0.0001;
      const falloff = 1 - distance / hole.radius;
      const pull = strength * (0.35 + 0.65 * falloff);
      const nx = dx / distance;
      const ny = dy / distance;
      const nz = dz / distance;

      const horizontal = Math.hypot(dx, dz);
      let tx = 0;
      let tz = 0;
      if (horizontal > 0.001) {
        tx = -dz / horizontal;
        tz = dx / horizontal;
      }

      const swirl = BLACKHOLE_SWIRL * falloff * fade;
      const targetX = nx * pull + tx * swirl;
      const targetY = ny * pull + 1.2 * falloff;
      const targetZ = nz * pull + tz * swirl;
      const mass = 1 / inverseMass;
      const velocity = state.bodyInterface.GetLinearVelocity(object.id);

      state.tmpVec3.Set(
        (targetX - velocity.GetX()) * mass * BLACKHOLE_VELOCITY_BLEND,
        (targetY - velocity.GetY()) * mass * BLACKHOLE_VELOCITY_BLEND,
        (targetZ - velocity.GetZ()) * mass * BLACKHOLE_VELOCITY_BLEND
      );
      state.bodyInterface.AddImpulse(object.id, state.tmpVec3);
      state.bodyInterface.ActivateBody(object.id);
    }
  }
}

export function updateTornadoes(dt) {
  for (const tornado of state.tornadoes) {
    if (!tornado.active) continue;

    tornado.age += dt;
    if (tornado.age >= tornado.duration) {
      deactivateTornado(tornado);
      continue;
    }

    const limit = GROUND_HALF_SIZE - TORNADO_RADIUS - GROUND_EDGE_MARGIN;
    tornado.position.x = THREE.MathUtils.clamp(
      tornado.position.x + tornado.direction.x * tornado.speed * dt,
      -limit,
      limit
    );
    tornado.position.z = THREE.MathUtils.clamp(
      tornado.position.z + tornado.direction.z * tornado.speed * dt,
      -limit,
      limit
    );

    const fade =
      Math.min(tornado.age / 0.4, 1) *
      Math.min((tornado.duration - tornado.age) / 0.55, 1);
    const radiusSq = tornado.radius * tornado.radius;

    for (const object of state.objects) {
      if (
        object.exploded ||
        object.absorbed ||
        object.portalFall ||
        object.stuckTo ||
        object === state.held
      ) {
        continue;
      }

      const p = object.body.GetPosition();
      const y = p.GetY();
      if (y < -1 || y > TORNADO_HEIGHT + 1) continue;

      const dx = tornado.position.x - p.GetX();
      const dz = tornado.position.z - p.GetZ();
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > radiusSq) continue;

      const inverseMass = object.body.GetMotionProperties().GetInverseMass();
      if (inverseMass <= 0) continue;

      const distance = Math.sqrt(distanceSq);
      const falloff = 1 - distance / tornado.radius;
      let inwardX = 0;
      let inwardZ = 0;
      let tangentX = 1;
      let tangentZ = 0;

      if (distance > 0.05) {
        inwardX = dx / distance;
        inwardZ = dz / distance;
        tangentX = -inwardZ;
        tangentZ = inwardX;
      }

      const pull = TORNADO_PULL * falloff * fade;
      const swirl = TORNADO_SWIRL * (0.45 + 0.55 * falloff) * fade;
      const targetX = inwardX * pull + tangentX * swirl;
      const targetZ = inwardZ * pull + tangentZ * swirl;
      const targetY = TORNADO_LIFT * (0.45 + 0.55 * falloff) * fade;
      const mass = 1 / inverseMass;
      const velocity = state.bodyInterface.GetLinearVelocity(object.id);

      state.tmpVec3.Set(
        (targetX - velocity.GetX()) * mass * TORNADO_VELOCITY_BLEND,
        (targetY - velocity.GetY()) * mass * TORNADO_VELOCITY_BLEND,
        (targetZ - velocity.GetZ()) * mass * TORNADO_VELOCITY_BLEND
      );
      state.bodyInterface.AddImpulse(object.id, state.tmpVec3);

      const spinScale = mass * (1.5 + 4.5 * falloff) * fade;
      state.tmpVec3b.Set(
        (Math.random() - 0.5) * spinScale,
        (Math.random() - 0.5) * spinScale,
        (Math.random() - 0.5) * spinScale
      );
      state.bodyInterface.AddAngularImpulse(object.id, state.tmpVec3b);
      state.bodyInterface.ActivateBody(object.id);
    }
  }
}

export function updatePortals(dt) {
  for (const portal of state.portals) {
    if (!portal.active) continue;

    portal.age += dt;
    if (portal.age >= portal.duration) {
      deactivatePortal(portal);
      continue;
    }

    const radiusSq = portal.radius * portal.radius;

    for (const object of state.objects) {
      if (
        object.exploded ||
        object.absorbed ||
        object.portalFall ||
        object.stuckTo ||
        object === state.held
      ) {
        continue;
      }

      const p = object.body.GetPosition();
      const y = p.GetY();
      if (y < -1 || y > PORTAL_CAPTURE_HEIGHT) continue;

      const dx = portal.position.x - p.GetX();
      const dz = portal.position.z - p.GetZ();
      if (dx * dx + dz * dz > radiusSq) continue;

      object.portalFall = true;
      state.bodyInterface.SetObjectLayer(object.id, LAYER_PORTAL);
      state.bodyInterface.ActivateBody(object.id);
    }
  }

  for (const object of state.objects) {
    if (!object.portalFall || object.exploded || object.absorbed) continue;
    if (object.body.GetPosition().GetY() <= PORTAL_REMOVE_DEPTH) {
      absorbObject(object);
    }
  }
}

export function applyBlast(x, y, z) {
  const radiusSq = BLAST_RADIUS * BLAST_RADIUS;
  const impulse = state.tmpVec3;

  for (const object of state.objects) {
    if (
      object.exploded ||
      object.absorbed ||
      object.stuckTo ||
      object === state.held
    ) {
      continue;
    }

    const dx = object.position.x - x;
    const dy = object.position.y - y;
    const dz = object.position.z - z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > radiusSq) continue;

    const inverseMass = object.body.GetMotionProperties().GetInverseMass();
    if (inverseMass <= 0) continue;

    const distance = Math.sqrt(distanceSq);
    const falloff = 1 - distance / BLAST_RADIUS;
    const mass = 1 / inverseMass;
    const speed = BLAST_SPEED * (0.35 + 0.65 * falloff);

    let nx = dx;
    let ny = dy + 0.6;
    let nz = dz;

    if (distance < 0.001) {
      const angle = Math.random() * Math.PI * 2;
      nx = Math.cos(angle);
      ny = 1;
      nz = Math.sin(angle);
    }

    const length = Math.hypot(nx, ny, nz) || 1;
    const scale = (speed * mass) / length;

    impulse.Set(nx * scale, ny * scale, nz * scale);
    state.bodyInterface.AddImpulse(object.id, impulse);

    const spin = state.tmpVec3b;
    const spinScale = mass * speed * 0.12;
    spin.Set(
      (Math.random() - 0.5) * spinScale,
      (Math.random() - 0.5) * spinScale,
      (Math.random() - 0.5) * spinScale
    );
    state.bodyInterface.AddAngularImpulse(object.id, spin);
    state.bodyInterface.ActivateBody(object.id);
  }

  const pdx = playerPos.x - x;
  const pdy = playerPos.y - y;
  const pdz = playerPos.z - z;
  const playerDistanceSq = pdx * pdx + pdy * pdy + pdz * pdz;
  if (playerDistanceSq >= radiusSq) return;

  const inverseMass = state.playerBody.GetMotionProperties().GetInverseMass();
  if (inverseMass <= 0) return;

  const distance = Math.sqrt(playerDistanceSq);
  const falloff = 1 - distance / BLAST_RADIUS;
  const mass = 1 / inverseMass;
  const speed = BLAST_SPEED * 0.55 * (0.4 + 0.6 * falloff);

  let nx = pdx;
  let ny = pdy + 0.9;
  let nz = pdz;
  const length = Math.hypot(nx, ny, nz) || 1;
  const scale = (speed * mass) / length;

  impulse.Set(nx * scale, ny * scale, nz * scale);
  state.bodyInterface.AddImpulse(state.playerId, impulse);
  state.bodyInterface.ActivateBody(state.playerId);
}


export function applyRemoteEffect(data) {
  if (!data) return;
  if (data.effectType === "blackhole") {
    spawnBlackHole(data.x, data.y, data.z);
  } else if (data.effectType === "portal") {
    spawnPortal(data.x, data.z, new THREE.Color(data.color || "#ffffff"));
  } else if (data.effectType === "tornado") {
    spawnTornado(data.x, data.z, data.dx || 1, data.dz || 0, new THREE.Color(data.color || "#ffffff"));
  } else if (data.effectType === "explosion") {
    applyBlast(data.x, data.y, data.z);
    spawnExplosion(data.x, data.y, data.z);
  }
}
