import * as THREE from "three";
import { state } from "../state.js";
import { CAPSULE_GROW, CAPSULE_STICK_PADDING, LAYER_MOVING, LAYER_STUCK } from "../constants.js";

const stickyCapsulePos = new THREE.Vector3();
const stickyCapsuleQuat = new THREE.Quaternion();
const stickyCapsuleInverse = new THREE.Quaternion();
const stickyCapsuleAxis = new THREE.Vector3();
const stickyCapsuleA = new THREE.Vector3();
const stickyCapsuleB = new THREE.Vector3();
const stickyPoint = new THREE.Vector3();
const stickyClosest = new THREE.Vector3();
const stickyObjectQuat = new THREE.Quaternion();
const stickyRotation = new THREE.Quaternion();
const stickyTarget = new THREE.Vector3();

export function activateStickyCapsule(object) {
  if (object.sticky) return;

  const J = state.J;
  const shape = new J.CapsuleShape(
    object.capsuleHalf * CAPSULE_GROW,
    object.capsuleRadius * CAPSULE_GROW
  );
  shape.SetDensity(object.density);
  shape.AddRef();

  object.sticky = true;
  object.grownShape = shape;
  object.scale.copy(object.baseScale).multiplyScalar(CAPSULE_GROW);
  object.bounds.copy(object.baseBounds).multiplyScalar(CAPSULE_GROW);
  object.radius = object.baseRadius * CAPSULE_GROW;

  state.bodyInterface.SetShape(
    object.id,
    shape,
    true,
    J.EActivation_Activate
  );
  state.bodyInterface.ActivateBody(object.id);

  if (!state.stickyCapsules.includes(object)) {
    state.stickyCapsules.push(object);
  }
}

export function releaseStuckObjects(capsule) {
  const stuckObjects = capsule.stuckObjects;
  if (!stuckObjects || !stuckObjects.length) return;

  for (const object of stuckObjects) {
    object.stuckTo = null;
    object.stuckOffset = null;
    object.stuckRotation = null;
    if (object.exploded || object.absorbed) continue;

    state.bodyInterface.SetObjectLayer(object.id, LAYER_MOVING);
    state.bodyInterface.SetGravityFactor(object.id, 1);
    state.bodyInterface.ActivateBody(object.id);
  }

  stuckObjects.length = 0;
}

export function attachStuckObject(capsule, object) {
  const p = object.body.GetPosition();
  const q = object.body.GetRotation();
  stickyPoint.set(p.GetX(), p.GetY(), p.GetZ());
  stickyObjectQuat.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
  stickyCapsuleInverse.copy(stickyCapsuleQuat).invert();

  object.stuckOffset = stickyPoint
    .clone()
    .sub(stickyCapsulePos)
    .applyQuaternion(stickyCapsuleInverse);
  object.stuckRotation = stickyCapsuleInverse
    .clone()
    .multiply(stickyObjectQuat);
  object.stuckTo = capsule;

  capsule.stuckObjects.push(object);
  state.bodyInterface.SetGravityFactor(object.id, 0);
  state.bodyInterface.SetObjectLayer(object.id, LAYER_STUCK);
  state.bodyInterface.SetLinearAndAngularVelocity(
    object.id,
    state.zeroVec3,
    state.zeroVec3
  );
}

export function updateStickyCapsules() {
  for (const capsule of state.stickyCapsules) {
    if (!capsule.sticky || capsule.exploded || capsule.absorbed) continue;

    const p = capsule.body.GetPosition();
    const q = capsule.body.GetRotation();
    stickyCapsulePos.set(p.GetX(), p.GetY(), p.GetZ());
    stickyCapsuleQuat.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
    stickyCapsuleAxis.set(0, 1, 0).applyQuaternion(stickyCapsuleQuat);

    const half = capsule.capsuleHalf * CAPSULE_GROW;
    const radius = capsule.capsuleRadius * CAPSULE_GROW;
    stickyCapsuleA
      .copy(stickyCapsulePos)
      .addScaledVector(stickyCapsuleAxis, -half);
    stickyCapsuleB
      .copy(stickyCapsulePos)
      .addScaledVector(stickyCapsuleAxis, half);

    const segmentX = stickyCapsuleB.x - stickyCapsuleA.x;
    const segmentY = stickyCapsuleB.y - stickyCapsuleA.y;
    const segmentZ = stickyCapsuleB.z - stickyCapsuleA.z;
    const segmentLengthSq =
      segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;

    for (const object of capsule.stuckObjects) {
      if (object.exploded || object.absorbed) continue;

      stickyTarget
        .copy(object.stuckOffset)
        .applyQuaternion(stickyCapsuleQuat)
        .add(stickyCapsulePos);
      stickyRotation
        .copy(stickyCapsuleQuat)
        .multiply(object.stuckRotation);

      state.tmpRVec3.Set(
        stickyTarget.x,
        stickyTarget.y,
        stickyTarget.z
      );
      state.tmpQuat.Set(
        stickyRotation.x,
        stickyRotation.y,
        stickyRotation.z,
        stickyRotation.w
      );
      state.bodyInterface.SetPositionAndRotation(
        object.id,
        state.tmpRVec3,
        state.tmpQuat,
        state.J.EActivation_DontActivate
      );
    }

    for (const object of state.objects) {
      if (
        object === capsule ||
        object.sticky ||
        object.stuckTo ||
        object.exploded ||
        object.absorbed ||
        object.portalFall ||
        object === state.held
      ) {
        continue;
      }

      const op = object.body.GetPosition();
      stickyPoint.set(op.GetX(), op.GetY(), op.GetZ());

      const relX = stickyPoint.x - stickyCapsuleA.x;
      const relY = stickyPoint.y - stickyCapsuleA.y;
      const relZ = stickyPoint.z - stickyCapsuleA.z;
      let t = 0;
      if (segmentLengthSq > 0.000001) {
        t = (relX * segmentX + relY * segmentY + relZ * segmentZ) / segmentLengthSq;
        t = THREE.MathUtils.clamp(t, 0, 1);
      }

      stickyClosest.set(
        stickyCapsuleA.x + segmentX * t,
        stickyCapsuleA.y + segmentY * t,
        stickyCapsuleA.z + segmentZ * t
      );

      const contactRadius = radius + object.radius + CAPSULE_STICK_PADDING;
      if (
        stickyClosest.distanceToSquared(stickyPoint) >
        contactRadius * contactRadius
      ) {
        continue;
      }

      attachStuckObject(capsule, object);
    }
  }
}
