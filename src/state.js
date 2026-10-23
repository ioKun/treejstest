import * as THREE from "three";

export const state = {
  J: null,
  jolt: null,
  world: null,
  bodyInterface: null,
  query: null,
  playerBody: null,
  playerId: null,
  playerRoot: null,
  limbs: null,
  objects: [],
  instances: {},
  highlightMesh: null,
  fx: null,
  blackHoles: [],
  portals: [],
  tornadoes: [],
  stickyCapsules: [],
  armed: [],
  held: null,
  highlighted: null,
  shredder: { shafts: [] },
  removed: 0,
  removedShown: -1,
  totalObjects: 0,
  skyTexture: null,
  grounded: false,
  jumpQueued: false,
  yaw: 0.35,
  pitch: 0.18,
  distance: 5.2,
  keys: new Set(),
  touchMove: { x: 0, y: 0 },
  touchRun: false,
  walkPhase: 0,
  facing: 0,
  hintEl: null,
  hintText: "",
  workerThreads: 1,
  ray: null,
  raySettings: null,
  rayCollector: null,
  bpFilterMoving: null,
  olFilterMoving: null,
  ignorePlayerFilter: null,
  shapeFilter: null,
  tmpRVec3: null,
  tmpQuat: null,
  tmpVec3: null,
  tmpVec3b: null,
  zeroVec3: null,
};

export const playerPos = new THREE.Vector3();
export const playerVel = new THREE.Vector3();
export const aimDir = new THREE.Vector3();
export const cameraPoint = new THREE.Vector3();
export const flatForward = new THREE.Vector3();
export const moveDir = new THREE.Vector3();
export const targetVec = new THREE.Vector3();
export const tmpMatrix = new THREE.Matrix4();
export const tmpColor = new THREE.Color();
export const AXIS_X = new THREE.Vector3(1, 0, 0);
export const AXIS_Y = new THREE.Vector3(0, 1, 0);
