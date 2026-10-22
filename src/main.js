import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import "./style.css";

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;

const LAYER_NON_MOVING = 0;
const LAYER_MOVING = 1;
const NUM_LAYERS = 2;

const PLAYER_RADIUS = 0.28;
const PLAYER_HALF_HEIGHT = 0.55;
const PLAYER_HALF_TOTAL = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
const PLAYER_SPAWN_Y = PLAYER_HALF_TOTAL + 0.2;

const WALK_SPEED = 4.2;
const RUN_SPEED = 6.8;
const JUMP_SPEED = 5.3;
const GRAB_DISTANCE = 5;
const GRAB_CONE = Math.cos(THREE.MathUtils.degToRad(42));
const HOLD_DISTANCE = 1.05;
const THROW_SPEED = 12;
const GROUND_HALF_SIZE = 40;
const SPAWN_MIN_RADIUS = 5;
const SPAWN_MAX_RADIUS = 38;
const SPAWN_CELL = 2;
const SPAWN_JITTER = 0.2;

const state = {
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
  held: null,
  highlighted: null,
  grounded: false,
  jumpQueued: false,
  yaw: 0.35,
  pitch: 0.28,
  distance: 5.2,
  keys: new Set(),
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
  perf: { physics: 0, update: 0, render: 0, total: 0 },
};

const playerPos = new THREE.Vector3();
const playerVel = new THREE.Vector3();
const aimDir = new THREE.Vector3();
const cameraPoint = new THREE.Vector3();
const flatForward = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const targetVec = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

let renderer;
let scene;
let camera;

boot().catch(reportFatalError);

async function boot() {
  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loader-text");

  state.hintEl = document.getElementById("hint");

  if (!crossOriginIsolated && navigator.serviceWorker) {
    loaderText.textContent = "Включение cross-origin isolation…";
    setTimeout(() => {
      if (!crossOriginIsolated) {
        loaderText.textContent =
          "Не удалось включить cross-origin isolation. Нужны HTTPS и поддержка Service Worker.";
      }
    }, 6000);
    return;
  }

  initGraphics();

  loaderText.textContent = "Инициализация Jolt MT…";
  await initPhysics();

  loaderText.textContent = "Сборка мира…";
  buildGroundPhysics();
  buildStickman();
  createPlayerBody();
  spawnObjects();

  setupInput();
  readPlayerState();
  syncMeshes();
  updateCamera(1);
  updateStats();

  if (import.meta.env.DEV) {
    window.__game = state;
    window.__gameApi = { tryGrab, throwHeld, dropHeld, resetWorld };
  }

  loaderText.textContent = "Готово";
  requestAnimationFrame(() => loader.classList.add("hidden"));
  setTimeout(() => loader.remove(), 700);

  restartClock();
  requestAnimationFrame(animate);
}

function reportFatalError(error) {
  console.error(error);
  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loader-text");
  if (!loader || !loaderText) return;
  loader.classList.remove("hidden");
  loader.classList.add("error");
  loader.style.opacity = "1";
  loader.style.visibility = "visible";
  loaderText.textContent =
    "Не удалось запустить игру.\n\n" +
    (error && error.message ? error.message : String(error)) +
    "\n\nJolt MT требует SharedArrayBuffer и cross-origin isolation. " +
    "Запускай через «npm run dev» или «npm run preview» — в конфиге Vite уже выставлены COOP/COEP.";
}

function initGraphics() {
  const canvas = document.getElementById("game");

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a101a, 0.016);

  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 220);

  addSky();
  addLights();
  addGroundVisual();
  addHighlightMesh();
  window.addEventListener("resize", onResize);
}

function addSky() {
  const geometry = new THREE.SphereGeometry(120, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x0e2036) },
      bottomColor: { value: new THREE.Color(0x05070b) },
      offset: { value: 12 },
      exponent: { value: 0.9 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(geometry, material);
  scene.add(sky);
}

function addLights() {
  const hemisphere = new THREE.HemisphereLight(0x9fd4ff, 0x1a1209, 1.15);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xfff0da, 2.7);
  sun.position.set(10, 16, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x6ea8ff, 0.55);
  fill.position.set(-9, 7, -11);
  scene.add(fill);
}

function addGroundVisual() {
  const texture = makeCheckerTexture();
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.94,
    metalness: 0.02,
    color: 0xc7d6ea,
  });

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(GROUND_HALF_SIZE * 2, 1, GROUND_HALF_SIZE * 2),
    material
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);
}

function addHighlightMesh() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0x5ee2ff,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 5;
  scene.add(mesh);
  state.highlightMesh = mesh;
}

function makeCheckerTexture() {
  const size = 512;
  const tiles = 8;
  const cell = size / tiles;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#1b2738" : "#16202e";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  ctx.strokeStyle = "rgba(120, 180, 255, 0.08)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= tiles; i++) {
    const p = i * cell;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 20);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function initPhysics() {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error("SharedArrayBuffer недоступен — страница не изолирована (COOP/COEP).");
  }

  const joltUrl = new URL(
    "jolt-physics.multithread.wasm-compat.js",
    document.baseURI
  ).href;
  const initJolt = (await import(/* @vite-ignore */ joltUrl)).default;
  const J = await initJolt();
  state.J = J;

  const bpStatic = new J.BroadPhaseLayer(0);
  const bpMoving = new J.BroadPhaseLayer(1);
  const bpInterface = new J.BroadPhaseLayerInterfaceTable(NUM_LAYERS, NUM_LAYERS);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_NON_MOVING, bpStatic);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, bpMoving);
  J.destroy(bpStatic);
  J.destroy(bpMoving);

  const pairFilter = new J.ObjectLayerPairFilterTable(NUM_LAYERS);
  pairFilter.EnableCollision(LAYER_NON_MOVING, LAYER_MOVING);
  pairFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);

  const objectVsBroadPhase = new J.ObjectVsBroadPhaseLayerFilterTable(
    bpInterface,
    NUM_LAYERS,
    pairFilter,
    NUM_LAYERS
  );

  const settings = new J.JoltSettings();
  settings.mMaxBodies = 2048;
  settings.mMaxBodyPairs = 8192;
  settings.mMaxContactConstraints = 8192;
  state.workerThreads = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8));
  settings.mMaxWorkerThreads = state.workerThreads;
  settings.mBroadPhaseLayerInterface = bpInterface;
  settings.mObjectVsBroadPhaseLayerFilter = objectVsBroadPhase;
  settings.mObjectLayerPairFilter = pairFilter;

  state.jolt = new J.JoltInterface(settings);
  J.destroy(settings);

  state.world = state.jolt.GetPhysicsSystem();
  state.bodyInterface = state.world.GetBodyInterface();
  state.query = state.world.GetNarrowPhaseQuery();

  state.ray = new J.RRayCast();
  state.raySettings = new J.RayCastSettings();
  state.raySettings.mTreatConvexAsSolid = true;
  state.rayCollector = new J.CastRayClosestHitCollisionCollector();
  state.bpFilterMoving = new J.DefaultBroadPhaseLayerFilter(
    state.jolt.GetObjectVsBroadPhaseLayerFilter(),
    LAYER_MOVING
  );
  state.olFilterMoving = new J.DefaultObjectLayerFilter(
    state.jolt.GetObjectLayerPairFilter(),
    LAYER_MOVING
  );
  state.shapeFilter = new J.ShapeFilter();
  state.tmpRVec3 = new J.RVec3(0, 0, 0);
  state.tmpQuat = new J.Quat(0, 0, 0, 1);
  state.tmpVec3 = new J.Vec3(0, 0, 0);
  state.tmpVec3b = new J.Vec3(0, 0, 0);
}

function buildGroundPhysics() {
  const J = state.J;
  const shape = new J.BoxShape(new J.Vec3(GROUND_HALF_SIZE, 0.5, GROUND_HALF_SIZE), 0.02);
  const position = new J.RVec3(0, -0.5, 0);
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

function buildStickman() {
  const root = new THREE.Group();
  root.position.set(0, PLAYER_SPAWN_Y, 0);
  scene.add(root);
  state.playerRoot = root;

  const skin = new THREE.MeshStandardMaterial({
    color: 0xffdfae,
    roughness: 0.55,
    metalness: 0.04,
    emissive: 0x2b1604,
    emissiveIntensity: 0.35,
  });

  const dark = new THREE.MeshStandardMaterial({
    color: 0x1a1f29,
    roughness: 0.45,
    metalness: 0.2,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.48, 6, 12), skin);
  torso.position.y = 0.31;
  torso.castShadow = true;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 24, 18), skin);
  head.position.y = 0.8;
  head.castShadow = true;
  root.add(head);

  const eyeGeometry = new THREE.SphereGeometry(0.024, 10, 8);
  const eyeLeft = new THREE.Mesh(eyeGeometry, dark);
  eyeLeft.position.set(-0.062, 0.83, 0.156);
  root.add(eyeLeft);
  const eyeRight = new THREE.Mesh(eyeGeometry, dark);
  eyeRight.position.set(0.062, 0.83, 0.156);
  root.add(eyeRight);

  const leftArm = makeLimb(root, -0.125, 0.53, 0, 0.56, 0.052, skin);
  const rightArm = makeLimb(root, 0.125, 0.53, 0, 0.56, 0.052, skin);
  const leftLeg = makeLimb(root, -0.085, -0.02, 0, 0.8, 0.062, skin);
  const rightLeg = makeLimb(root, 0.085, -0.02, 0, 0.8, 0.062, skin);

  state.limbs = { leftArm, rightArm, leftLeg, rightLeg };
}

function makeLimb(parent, x, y, z, length, radius, material) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);

  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 4, 8);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;

  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

function createPlayerBody() {
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
    J.EAllowedDOFs_TranslationX | J.EAllowedDOFs_TranslationY | J.EAllowedDOFs_TranslationZ;
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

const SOFT_COLORS = [
  0xff8a5b, 0xffc857, 0x5dd6a8, 0x59c3ff, 0xb08cff, 0xff6f91, 0x8ee36b, 0x4fb3bf,
  0xf2a65a, 0x7d9bff, 0xe76fe0, 0x8bd450, 0xffb4a2, 0x5fa8ff,
];
const METAL_COLORS = [0x8d99a6, 0xb87333, 0xc9a227, 0x6f7a85, 0x9aa7b1, 0x7c5c3e];
const PIPE_COLORS = [0x4fb3bf, 0x8d99a6, 0xb87333, 0x5f7f8f, 0xa44a3f, 0x6f7a85];
const FRAME_COLORS = [0x59c3ff, 0x8d99a6, 0xff8a5b, 0x5dd6a8, 0xb08cff, 0x7d9bff];

const OBJECT_NAMES = {
  box: "куб",
  sphere: "шар",
  capsule: "капсула",
  gear: "шестерёнка",
  wire: "проволока",
  pipe: "труба",
  frame: "рама",
};

function createGearGeometry() {
  const teeth = 14;
  const outer = 1;
  const root = 0.82;
  const step = (Math.PI * 2) / teeth;
  const shape = new THREE.Shape();

  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const points = [
      [a, root],
      [a + step * 0.12, outer],
      [a + step * 0.34, outer],
      [a + step * 0.46, root],
    ];

    for (let k = 0; k < points.length; k++) {
      const angle = points[k][0];
      const r = points[k][1];
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0 && k === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
  }

  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.34, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -0.5);
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createWireGeometry() {
  const points = [];
  const segments = 10;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(
      new THREE.Vector3(
        Math.sin(t * Math.PI * 3) * 0.055,
        t - 0.5,
        Math.cos(t * Math.PI * 2) * 0.035
      )
    );
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 28, 0.028, 6, false);
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  return geometry;
}

function createPipeGeometry() {
  const profile = [
    new THREE.Vector2(0.72, -0.5),
    new THREE.Vector2(1, -0.5),
    new THREE.Vector2(1, 0.5),
    new THREE.Vector2(0.72, 0.5),
    new THREE.Vector2(0.72, -0.5),
  ];
  const geometry = new THREE.LatheGeometry(profile, 20);
  geometry.computeVertexNormals();
  return geometry;
}

function createFrameGeometry() {
  const thickness = 0.14;
  const parts = [
    new THREE.BoxGeometry(1, thickness, 1).translate(0, 0.5 - thickness / 2, 0),
    new THREE.BoxGeometry(1, thickness, 1).translate(0, -0.5 + thickness / 2, 0),
    new THREE.BoxGeometry(thickness, 1 - thickness * 2, 1).translate(-0.5 + thickness / 2, 0, 0),
    new THREE.BoxGeometry(thickness, 1 - thickness * 2, 1).translate(0.5 - thickness / 2, 0, 0),
  ];
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

const TYPE_CONFIG = {
  box: {
    count: 220,
    geometry: () => new THREE.BoxGeometry(1, 1, 1),
    material: () =>
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.08 }),
    palette: SOFT_COLORS,
  },
  sphere: {
    count: 160,
    geometry: () => new THREE.SphereGeometry(1, 18, 12),
    material: () =>
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.1 }),
    palette: SOFT_COLORS,
  },
  capsule: {
    count: 140,
    geometry: () => new THREE.CapsuleGeometry(0.5, 1, 4, 10),
    material: () =>
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.1 }),
    palette: SOFT_COLORS,
  },
  gear: {
    count: 160,
    geometry: createGearGeometry,
    material: () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.33,
        metalness: 0.35,
        flatShading: true,
      }),
    palette: METAL_COLORS,
  },
  wire: {
    count: 140,
    geometry: createWireGeometry,
    material: () =>
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.4 }),
    palette: METAL_COLORS,
  },
  pipe: {
    count: 100,
    geometry: createPipeGeometry,
    material: () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.35,
        side: THREE.DoubleSide,
      }),
    palette: PIPE_COLORS,
  },
  frame: {
    count: 80,
    geometry: createFrameGeometry,
    material: () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0.25,
        flatShading: true,
      }),
    palette: FRAME_COLORS,
  },
};

function buildSpawnCells() {
  const cells = [];
  const pad = SPAWN_CELL;
  const min = -SPAWN_MAX_RADIUS - pad;
  const max = SPAWN_MAX_RADIUS + pad;

  for (let x = min; x <= max; x += SPAWN_CELL) {
    for (let z = min; z <= max; z += SPAWN_CELL) {
      const cx = x + SPAWN_CELL / 2 + (Math.random() - 0.5) * SPAWN_JITTER * 2;
      const cz = z + SPAWN_CELL / 2 + (Math.random() - 0.5) * SPAWN_JITTER * 2;
      const distance = Math.hypot(cx, cz);
      if (distance < SPAWN_MIN_RADIUS || distance > SPAWN_MAX_RADIUS) continue;
      cells.push({ x: cx, z: cz });
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

function spawnObjects() {
  const cells = buildSpawnCells();
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

    scene.add(mesh);
    state.instances[type] = mesh;

    for (let i = 0; i < config.count; i++) {
      let cell = cells[cellCursor++];

      if (!cell) {
        const angle = Math.random() * Math.PI * 2;
        const distance =
          SPAWN_MIN_RADIUS + Math.sqrt(Math.random()) * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS);
        cell = { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
      }

      createObject(type, i, mesh, config.palette, cell.x, cell.z);
    }

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function createObject(type, index, mesh, palette, spawnX, spawnZ) {
  const J = state.J;
  const yaw = Math.random() * Math.PI * 2;

  let shape;
  let scale;
  let bounds;
  let radius;
  let restHeight;
  let density = 90;
  let friction = 0.6;
  let restitution = 0.18;
  let angularDamping = 0.15;

  if (type === "box") {
    const size = 0.4 + Math.random() * 0.55;
    const half = size / 2;
    shape = new J.BoxShape(new J.Vec3(half, half, half), 0.02);
    scale = new THREE.Vector3(size, size, size);
    bounds = new THREE.Vector3(size, size, size);
    radius = half;
    restHeight = half;
  } else if (type === "sphere") {
    const r = 0.16 + Math.random() * 0.3;
    shape = new J.SphereShape(r);
    scale = new THREE.Vector3(r, r, r);
    bounds = new THREE.Vector3(r * 2, r * 2, r * 2);
    radius = r;
    restHeight = r;
  } else if (type === "capsule") {
    const r = 0.13 + Math.random() * 0.13;
    const half = 0.2 + Math.random() * 0.3;
    shape = new J.CapsuleShape(half, r);
    scale = new THREE.Vector3(r * 2, half + r, r * 2);
    bounds = new THREE.Vector3(r * 2, (half + r) * 2, r * 2);
    radius = half + r;
    restHeight = r;
  } else if (type === "gear") {
    const gearRadius = 0.24 + Math.random() * 0.32;
    const thickness = 0.08 + Math.random() * 0.14;
    shape = new J.CylinderShape(thickness / 2, gearRadius, 0.02);
    scale = new THREE.Vector3(gearRadius, thickness, gearRadius);
    bounds = new THREE.Vector3(gearRadius * 2, thickness, gearRadius * 2);
    radius = gearRadius;
    restHeight = thickness / 2;
    density = 260;
    restitution = 0.05;
    angularDamping = 0.25;
  } else if (type === "wire") {
    const length = 0.7 + Math.random() * 0.9;
    shape = new J.CapsuleShape(length / 2, 0.05);
    scale = new THREE.Vector3(1, length, 1);
    bounds = new THREE.Vector3(0.32, length, 0.32);
    radius = length / 2;
    restHeight = 0.06;
    density = 500;
    friction = 0.5;
    restitution = 0.08;
  } else if (type === "pipe") {
    const pipeRadius = 0.16 + Math.random() * 0.18;
    const length = 0.7 + Math.random() * 0.8;
    shape = new J.CylinderShape(length / 2, pipeRadius, 0.02);
    scale = new THREE.Vector3(pipeRadius, length, pipeRadius);
    bounds = new THREE.Vector3(pipeRadius * 2, length, pipeRadius * 2);
    radius = Math.max(pipeRadius, length / 2);
    restHeight = pipeRadius;
    density = 180;
    friction = 0.55;
    restitution = 0.05;
    angularDamping = 0.22;
  } else {
    const size = 0.65 + Math.random() * 0.5;
    const depth = 0.07 + Math.random() * 0.08;
    shape = new J.BoxShape(new J.Vec3(size / 2, size / 2, depth / 2), 0.015);
    scale = new THREE.Vector3(size, size, depth);
    bounds = new THREE.Vector3(size, size, depth);
    radius = size / 2;
    restHeight = depth / 2;
    density = 200;
    friction = 0.6;
    restitution = 0.04;
    angularDamping = 0.2;
  }

  shape.SetDensity(density);

  let spawnRotation;
  if (type === "sphere") {
    spawnRotation = new THREE.Quaternion();
  } else if (type === "capsule" || type === "wire" || type === "pipe" || type === "frame") {
    spawnRotation = new THREE.Quaternion()
      .setFromAxisAngle(AXIS_Y, yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, Math.PI / 2));
  } else {
    spawnRotation = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, yaw);
  }

  const spawnY = restHeight + 0.02 + Math.random() * 0.08;
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
  settings.mFriction = friction;
  settings.mRestitution = restitution;
  settings.mLinearDamping = 0.04;
  settings.mAngularDamping = angularDamping;
  settings.mAllowSleeping = true;
  settings.mMotionQuality = J.EMotionQuality_Discrete;

  const body = state.bodyInterface.CreateBody(settings);
  J.destroy(settings);
  J.destroy(position);
  J.destroy(rotation);

  const id = body.GetID();
  state.bodyInterface.AddBody(id, J.EActivation_Activate);

  const object = {
    type,
    name: OBJECT_NAMES[type],
    body,
    id,
    radius,
    scale,
    bounds,
    position: spawnPosition.clone(),
    quaternion: spawnRotation.clone(),
    instanceMesh: mesh,
    instanceIndex: index,
    spawnPosition,
    spawnRotation,
  };

  state.objects.push(object);

  tmpMatrix.compose(spawnPosition, spawnRotation, scale);
  mesh.setMatrixAt(index, tmpMatrix);
  mesh.setColorAt(index, tmpColor.setHex(palette[index % palette.length]));
}

function setupInput() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => state.keys.clear());

  const canvas = renderer.domElement;
  const drag = { active: false, x: 0, y: 0, moved: 0, pointerId: -1 };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag.active = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved = 0;
    drag.pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    state.yaw -= dx * 0.0055;
    state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.0045, -0.25, 1.15);
  });

  const endDrag = (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    drag.active = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (drag.moved < 7) primaryAction();
  };

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      state.distance = THREE.MathUtils.clamp(
        state.distance + event.deltaY * 0.0028,
        2.6,
        9.5
      );
    },
    { passive: false }
  );

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
}

function onKeyDown(event) {
  const code = event.code;

  if (
    code === "Space" ||
    code === "KeyW" ||
    code === "KeyA" ||
    code === "KeyS" ||
    code === "KeyD" ||
    code === "KeyE" ||
    code === "KeyR" ||
    code === "ShiftLeft" ||
    code === "ShiftRight"
  ) {
    event.preventDefault();
  }

  state.keys.add(code);

  if (code === "Space" && !event.repeat) state.jumpQueued = true;
  if (code === "KeyE" && !event.repeat) toggleHold();
  if (code === "KeyR" && !event.repeat) resetWorld();
}

function onKeyUp(event) {
  state.keys.delete(event.code);
}

function primaryAction() {
  if (state.held) throwHeld();
  else tryGrab();
}

function toggleHold() {
  if (state.held) dropHeld();
  else tryGrab();
}

function readPlayerState() {
  const p = state.playerBody.GetPosition();
  playerPos.set(p.GetX(), p.GetY(), p.GetZ());

  const v = state.bodyInterface.GetLinearVelocity(state.playerId);
  playerVel.set(v.GetX(), v.GetY(), v.GetZ());
}

function readBodyPosition(object, out) {
  const p = object.body.GetPosition();
  out.set(p.GetX(), p.GetY(), p.GetZ());
  return out;
}

function getAimDirection(out) {
  cameraPoint.copy(playerPos);
  cameraPoint.y += 0.55;
  return out.copy(cameraPoint).sub(camera.position).normalize();
}

function getFlatForward(out) {
  return out.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
}

function castRay(origin, direction, maxDistance) {
  state.ray.mOrigin.Set(origin.x, origin.y, origin.z);
  state.ray.mDirection.Set(
    direction.x * maxDistance,
    direction.y * maxDistance,
    direction.z * maxDistance
  );

  state.rayCollector.Reset();
  state.query.CastRay(
    state.ray,
    state.raySettings,
    state.rayCollector,
    state.bpFilterMoving,
    state.olFilterMoving,
    state.ignorePlayerFilter,
    state.shapeFilter
  );

  return state.rayCollector.HadHit();
}

function findGrabTarget() {
  getAimDirection(aimDir);

  const originX = playerPos.x;
  const originY = playerPos.y + 0.32;
  const originZ = playerPos.z;

  let best = null;
  let bestScore = Infinity;

  for (const object of state.objects) {
    if (object === state.held) continue;

    const dx = object.position.x - originX;
    const dy = object.position.y - originY;
    const dz = object.position.z - originZ;
    const distance = Math.hypot(dx, dy, dz);

    if (distance < 0.25 || distance > GRAB_DISTANCE) continue;

    const dot = (dx * aimDir.x + dy * aimDir.y + dz * aimDir.z) / distance;
    if (dot < GRAB_CONE) continue;

    const score = distance * (1.4 - dot);
    if (score < bestScore) {
      bestScore = score;
      best = object;
    }
  }

  return best;
}

function tryGrab() {
  if (state.held) return;

  readPlayerState();
  const object = findGrabTarget();
  if (!object) return;

  state.held = object;
  state.bodyInterface.SetGravityFactor(object.id, 0);
  state.bodyInterface.SetAngularVelocity(object.id, zeroVec3());
  state.bodyInterface.ActivateBody(object.id);
}

function dropHeld() {
  const object = state.held;
  if (!object) return;

  getFlatForward(flatForward);
  state.bodyInterface.SetGravityFactor(object.id, 1);
  setBodyVelocity(object.id, flatForward.x * 1.2, 0, flatForward.z * 1.2);
  state.bodyInterface.ActivateBody(object.id);
  state.held = null;
}

function throwHeld() {
  const object = state.held;
  if (!object) return;

  readPlayerState();
  getAimDirection(aimDir);

  const vx = aimDir.x * THROW_SPEED + playerVel.x * 0.5;
  const vy = aimDir.y * THROW_SPEED + 1.1;
  const vz = aimDir.z * THROW_SPEED + playerVel.z * 0.5;

  state.bodyInterface.SetGravityFactor(object.id, 1);
  setBodyVelocity(object.id, vx, vy, vz);

  const spin = state.tmpVec3b;
  spin.Set(
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10
  );
  state.bodyInterface.SetAngularVelocity(object.id, spin);
  state.bodyInterface.ActivateBody(object.id);

  state.held = null;
}

function setBodyVelocity(id, x, y, z) {
  const velocity = state.tmpVec3;
  velocity.Set(x, y, z);
  state.bodyInterface.SetLinearVelocity(id, velocity);
}

function zeroVec3() {
  const zero = state.tmpVec3b;
  zero.Set(0, 0, 0);
  return zero;
}

function updatePlayer(dt) {
  readPlayerState();
  state.grounded = checkGrounded();

  const forwardInput =
    (state.keys.has("KeyW") ? 1 : 0) - (state.keys.has("KeyS") ? 1 : 0);
  const sideInput =
    (state.keys.has("KeyD") ? 1 : 0) - (state.keys.has("KeyA") ? 1 : 0);

  getFlatForward(flatForward);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);

  moveDir.set(
    flatForward.x * forwardInput + rightX * sideInput,
    0,
    flatForward.z * forwardInput + rightZ * sideInput
  );

  const moving = moveDir.lengthSq() > 0.0001;
  if (moving) moveDir.normalize();

  const running = state.keys.has("ShiftLeft") || state.keys.has("ShiftRight");
  const speed = running ? RUN_SPEED : WALK_SPEED;

  let vy = playerVel.y;

  if (state.jumpQueued) {
    state.jumpQueued = false;
    if (state.grounded) vy = JUMP_SPEED;
  }

  const control = state.grounded ? 16 : 4.5;
  const blend = 1 - Math.exp(-control * dt);

  let vx = playerVel.x + (moveDir.x * speed - playerVel.x) * blend;
  let vz = playerVel.z + (moveDir.z * speed - playerVel.z) * blend;

  if (!moving && state.grounded) {
    const brake = Math.exp(-20 * dt);
    vx *= brake;
    vz *= brake;
  }

  if (playerPos.y < -12) {
    respawnPlayer();
    return;
  }

  setBodyVelocity(state.playerId, vx, vy, vz);
}

function checkGrounded() {
  targetVec.copy(playerPos);
  targetVec.y += 0.05;
  aimDir.set(0, -1, 0);
  return castRay(targetVec, aimDir, PLAYER_HALF_TOTAL + 0.22);
}

function updateHeld(dt) {
  const object = state.held;
  if (!object) return;

  readPlayerState();
  getFlatForward(flatForward);

  const holdDistance = HOLD_DISTANCE + object.radius * 0.55;
  targetVec.copy(playerPos);
  targetVec.y += 0.35;
  targetVec.addScaledVector(flatForward, holdDistance);

  readBodyPosition(object, cameraPoint);
  const dx = targetVec.x - cameraPoint.x;
  const dy = targetVec.y - cameraPoint.y;
  const dz = targetVec.z - cameraPoint.z;

  if (Math.hypot(dx, dy, dz) > 3.6) {
    dropHeld();
    return;
  }

  const k = 16;
  let vx = dx * k + playerVel.x * 0.75;
  let vy = dy * k + playerVel.y * 0.35;
  let vz = dz * k + playerVel.z * 0.75;

  const maxSpeed = 26;
  const speed = Math.hypot(vx, vy, vz);
  if (speed > maxSpeed) {
    const s = maxSpeed / speed;
    vx *= s;
    vy *= s;
    vz *= s;
  }

  setBodyVelocity(object.id, vx, vy, vz);
  state.bodyInterface.SetAngularVelocity(object.id, zeroVec3());
  state.bodyInterface.ActivateBody(object.id);
}

function respawnPlayer() {
  const J = state.J;
  const position = state.tmpRVec3;
  position.Set(0, PLAYER_SPAWN_Y, 0);
  state.tmpQuat.Set(0, 0, 0, 1);
  state.bodyInterface.SetPositionAndRotation(
    state.playerId,
    position,
    state.tmpQuat,
    J.EActivation_Activate
  );
  setBodyVelocity(state.playerId, 0, 0, 0);
  readPlayerState();
}

function resetWorld() {
  const J = state.J;

  if (state.held) {
    state.bodyInterface.SetGravityFactor(state.held.id, 1);
    state.held = null;
  }

  for (const object of state.objects) {
    state.tmpRVec3.Set(
      object.spawnPosition.x,
      object.spawnPosition.y,
      object.spawnPosition.z
    );
    state.tmpQuat.Set(
      object.spawnRotation.x,
      object.spawnRotation.y,
      object.spawnRotation.z,
      object.spawnRotation.w
    );
    state.bodyInterface.SetPositionAndRotation(
      object.id,
      state.tmpRVec3,
      state.tmpQuat,
      J.EActivation_Activate
    );
    state.bodyInterface.SetLinearAndAngularVelocity(
      object.id,
      zeroVec3(),
      zeroVec3()
    );
    state.bodyInterface.SetGravityFactor(object.id, 1);
  }

  respawnPlayer();
}

function updateCamera(dt) {
  const target = cameraPoint;
  target.copy(playerPos);
  target.y += 0.55;

  const cosPitch = Math.cos(state.pitch);
  const x = target.x + Math.sin(state.yaw) * cosPitch * state.distance;
  const y = target.y + Math.sin(state.pitch) * state.distance;
  const z = target.z + Math.cos(state.yaw) * cosPitch * state.distance;

  camera.position.set(x, Math.max(0.32, y), z);
  camera.lookAt(target);
}

function updateHighlight() {
  if (state.held) {
    setHighlighted(null);
    setHint("ЛКМ — бросить · E — отпустить", true);
    return;
  }

  const object = findGrabTarget();
  setHighlighted(object);

  if (object) {
    setHint(`${object.name.toUpperCase()} · ЛКМ — схватить`, true);
  } else {
    setHint("Перетаскивай мышь — камера · Колесо — зум", false);
  }
}

function setHint(text, active) {
  if (state.hintText !== text) {
    state.hintText = text;
    state.hintEl.textContent = text;
  }
  state.hintEl.classList.toggle("active", active);
}

function setHighlighted(object) {
  state.highlighted = object;

  const mesh = state.highlightMesh;
  if (!object) {
    mesh.visible = false;
    return;
  }

  mesh.visible = true;
  mesh.position.copy(object.position);
  mesh.quaternion.copy(object.quaternion);
  mesh.scale.set(
    object.bounds.x + 0.06,
    object.bounds.y + 0.06,
    object.bounds.z + 0.06
  );
}

function syncMeshes() {
  for (const object of state.objects) {
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

function animateLimbs(dt) {
  const speed = Math.hypot(playerVel.x, playerVel.z);
  const intensity = THREE.MathUtils.clamp(speed / RUN_SPEED, 0, 1);

  state.walkPhase += dt * (2.2 + speed * 2.4);

  const swing = Math.sin(state.walkPhase) * 0.85 * intensity;
  const { leftArm, rightArm, leftLeg, rightLeg } = state.limbs;

  leftLeg.rotation.x = swing;
  rightLeg.rotation.x = -swing;

  if (state.held) {
    const hold = -1.15 + Math.sin(state.walkPhase * 2) * 0.04;
    leftArm.rotation.x += (hold - leftArm.rotation.x) * Math.min(1, dt * 12);
    rightArm.rotation.x += (hold - rightArm.rotation.x) * Math.min(1, dt * 12);
  } else {
    leftArm.rotation.x += (-swing * 0.8 - leftArm.rotation.x) * Math.min(1, dt * 18);
    rightArm.rotation.x += (swing * 0.8 - rightArm.rotation.x) * Math.min(1, dt * 18);
  }

  const bob = Math.sin(state.walkPhase * 2) * 0.015 * intensity;
  state.playerRoot.position.y += bob;
}

function dampAngle(current, target, lambda, dt) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

function updateStats() {
  const el = document.getElementById("stats");
  if (!el) return;
  el.textContent = `Jolt MT · ${state.workerThreads} потоков · ${state.objects.length} предметов`;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

let clock = null;
let accumulator = 0;

function restartClock() {
  clock = new THREE.Timer();
  clock.connect(document);
  clock.update();
  accumulator = 0;
}

function fixedUpdate() {
  updatePlayer(FIXED_DT);
  updateHeld(FIXED_DT);
  state.jolt.Step(FIXED_DT, 1);
}

function animate() {
  requestAnimationFrame(animate);
  const frameStart = performance.now();

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
  const afterPhysics = performance.now();

  readPlayerState();
  syncMeshes();
  animateLimbs(Math.min(dt, 0.05));
  updateCamera(dt);
  updateHighlight();
  const afterUpdate = performance.now();

  renderer.render(scene, camera);
  const afterRender = performance.now();

  const perf = state.perf;
  perf.physics += (afterPhysics - frameStart - perf.physics) * 0.1;
  perf.update += (afterUpdate - afterPhysics - perf.update) * 0.1;
  perf.render += (afterRender - afterUpdate - perf.render) * 0.1;
  perf.total += (afterRender - frameStart - perf.total) * 0.1;
}
