import * as THREE from "three";
import { state, tmpMatrix, tmpColor, AXIS_X, AXIS_Y } from "../state.js";
import { OBJECT_NAMES, TYPE_CONFIG } from "../graphics/objectAssets.js";
import { LAYER_MOVING } from "../constants.js";

const DEFAULT_PHYSICS = {
  density: 90,
  friction: 0.6,
  restitution: 0.18,
  angularDamping: 0.15,
};

const PHYSICS_BY_TYPE = {
  gear: { density: 260, restitution: 0.05, angularDamping: 0.25 },
  wire: { density: 500, friction: 0.5, restitution: 0.08 },
  pipe: { density: 180, friction: 0.55, restitution: 0.05, angularDamping: 0.22 },
  frame: { density: 200, restitution: 0.04, angularDamping: 0.2 },
};

const ROTATION_BY_TYPE = {
  box: "upright",
  sphere: "identity",
  capsule: "lying",
  gear: "upright",
  wire: "lying",
  pipe: "lying",
  frame: "lying",
};

const SHAPE_FACTORIES = {
  box(J) {
    const size = 0.35 + Math.random() * 0.45;
    const half = size / 2;
    return {
      shape: new J.BoxShape(new J.Vec3(half, half, half), 0.02),
      scale: new THREE.Vector3(size, size, size),
      bounds: new THREE.Vector3(size, size, size),
      radius: half,
      restHeight: half,
    };
  },
  sphere(J) {
    const r = 0.14 + Math.random() * 0.22;
    return {
      shape: new J.SphereShape(r),
      scale: new THREE.Vector3(r, r, r),
      bounds: new THREE.Vector3(r * 2, r * 2, r * 2),
      radius: r,
      restHeight: r,
    };
  },
  capsule(J) {
    const r = 0.11 + Math.random() * 0.11;
    const half = 0.18 + Math.random() * 0.14;
    return {
      shape: new J.CapsuleShape(half, r),
      scale: new THREE.Vector3(r * 2, half + r, r * 2),
      bounds: new THREE.Vector3(r * 2, (half + r) * 2, r * 2),
      radius: half + r,
      restHeight: r,
      capsuleHalf: half,
      capsuleRadius: r,
    };
  },
  gear(J) {
    const gearRadius = 0.2 + Math.random() * 0.26;
    const thickness = 0.07 + Math.random() * 0.09;
    return {
      shape: new J.CylinderShape(thickness / 2, gearRadius, 0.02),
      scale: new THREE.Vector3(gearRadius, thickness, gearRadius),
      bounds: new THREE.Vector3(gearRadius * 2, thickness, gearRadius * 2),
      radius: gearRadius,
      restHeight: thickness / 2,
    };
  },
  wire(J) {
    const length = 0.55 + Math.random() * 0.45;
    return {
      shape: new J.CapsuleShape(length / 2, 0.05),
      scale: new THREE.Vector3(1, length, 1),
      bounds: new THREE.Vector3(0.32, length, 0.32),
      radius: length / 2,
      restHeight: 0.06,
    };
  },
  pipe(J) {
    const pipeRadius = 0.14 + Math.random() * 0.12;
    const length = 0.55 + Math.random() * 0.45;
    return {
      shape: new J.CylinderShape(length / 2, pipeRadius, 0.02),
      scale: new THREE.Vector3(pipeRadius, length, pipeRadius),
      bounds: new THREE.Vector3(pipeRadius * 2, length, pipeRadius * 2),
      radius: Math.max(pipeRadius, length / 2),
      restHeight: pipeRadius,
    };
  },
  frame(J) {
    const size = 0.55 + Math.random() * 0.35;
    const depth = 0.06 + Math.random() * 0.07;
    return {
      shape: new J.BoxShape(new J.Vec3(size / 2, size / 2, depth / 2), 0.015),
      scale: new THREE.Vector3(size, size, depth),
      bounds: new THREE.Vector3(size, size, depth),
      radius: size / 2,
      restHeight: depth / 2,
    };
  },
};

export function createObject(type, index, mesh, palette, spawnX, spawnZ, spawnBaseY) {
  const J = state.J;
  const yaw = Math.random() * Math.PI * 2;
  const built = SHAPE_FACTORIES[type](J);
  const physics = { ...DEFAULT_PHYSICS, ...PHYSICS_BY_TYPE[type] };
  const shape = built.shape;

  shape.SetDensity(physics.density);

  const kind = ROTATION_BY_TYPE[type];
  let spawnRotation;
  if (kind === "identity") {
    spawnRotation = new THREE.Quaternion();
  } else if (kind === "lying") {
    spawnRotation = new THREE.Quaternion()
      .setFromAxisAngle(AXIS_Y, yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, Math.PI / 2));
  } else {
    spawnRotation = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, yaw);
  }

  const spawnY = spawnBaseY + built.restHeight + 0.02 + Math.random() * 0.04;
  const spawnPosition = new THREE.Vector3(spawnX, spawnY, spawnZ);

  const position = new J.RVec3(spawnX, spawnY, spawnZ);
  const rotation = new J.Quat(
    spawnRotation.x,
    spawnRotation.y,
    spawnRotation.z,
    spawnRotation.w
  );
  const settings = new J.BodyCreationSettings(
    shape,
    position,
    rotation,
    J.EMotionType_Dynamic,
    LAYER_MOVING
  );
  settings.mFriction = physics.friction;
  settings.mRestitution = physics.restitution;
  settings.mLinearDamping = 0.04;
  settings.mAngularDamping = physics.angularDamping;
  settings.mAllowSleeping = true;
  settings.mMotionQuality = J.EMotionQuality_Discrete;

  const body = state.bodyInterface.CreateBody(settings);
  J.destroy(settings);
  J.destroy(position);
  J.destroy(rotation);

  const id = body.GetID();
  state.bodyInterface.AddBody(id, J.EActivation_Activate);

  if (type === "capsule") shape.AddRef();

  const object = {
    type,
    name: OBJECT_NAMES[type],
    body,
    id,
    shape,
    density: physics.density,
    radius: built.radius,
    scale: built.scale,
    bounds: built.bounds,
    baseScale: type === "capsule" ? built.scale.clone() : null,
    baseBounds: type === "capsule" ? built.bounds.clone() : null,
    baseRadius: built.radius,
    capsuleHalf: built.capsuleHalf || 0,
    capsuleRadius: built.capsuleRadius || 0,
    sticky: false,
    grownShape: null,
    stuckTo: null,
    stuckObjects: type === "capsule" ? [] : null,
    position: spawnPosition.clone(),
    quaternion: spawnRotation.clone(),
    instanceMesh: mesh,
    instanceIndex: index,
    spawnPosition,
    spawnRotation,
    exploded: false,
    absorbed: false,
    portalFall: false,
    throwDirection: null,
    fuse: 0,
  };

  state.objects.push(object);

  tmpMatrix.compose(spawnPosition, spawnRotation, built.scale);
  mesh.setMatrixAt(index, tmpMatrix);
  mesh.setColorAt(index, tmpColor.setHex(palette[index % palette.length]));
}
