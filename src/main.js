import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import "./style.css";

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;

const LAYER_NON_MOVING = 0;
const LAYER_MOVING = 1;
const LAYER_PORTAL = 2;
const LAYER_STUCK = 3;
const NUM_LAYERS = 4;

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
const PILE_CENTER_Z = -16;
const PILE_BASE_RADIUS = 12;
const PILE_LAYERS = 7;
const PILE_LAYER_SHRINK = 1.5;
const PILE_LAYER_HEIGHT = 0.9;
const PILE_CELL = 1.16;
const PILE_JITTER = 0.04;
const BLAST_RADIUS = 5.5;
const BLAST_SPEED = 11;
const SPECIAL_FUSE = 0.6;
const MAX_SPARKS = 400;
const BLACKHOLE_RADIUS = 7.5;
const BLACKHOLE_DURATION = 4.5;
const BLACKHOLE_PULL = 16;
const BLACKHOLE_SWIRL = 3.5;
const BLACKHOLE_ABSORB_RADIUS = 0.65;
const BLACKHOLE_ABSORB_RATE = 5;
const PORTAL_RADIUS = 3.2;
const PORTAL_DURATION = 7.5;
const PORTAL_CAPTURE_HEIGHT = 1.5;
const PORTAL_REMOVE_DEPTH = -0.65;
const CAPSULE_GROW = 2.8;
const CAPSULE_STICK_PADDING = 0.05;
const TORNADO_RADIUS = 2;
const TORNADO_HEIGHT = 4.2;
const TORNADO_DURATION = 5;
const TORNADO_SPEED = 6.5;
const TORNADO_PULL = 15;
const TORNADO_SWIRL = 16;
const TORNADO_LIFT = 9.5;
const TORNADO_PARTICLES = 80;

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
  fx: null,
  blackHoles: [],
  portals: [],
  tornadoes: [],
  stickyCapsules: [],
  armed: [],
  held: null,
  highlighted: null,
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
const PORTAL_BASE_COLOR = new THREE.Color(0x59c3ff);
const TORNADO_BASE_COLOR = new THREE.Color(0xb9c9d6);
const stickyCapsulePos = new THREE.Vector3();
const stickyCapsuleQuat = new THREE.Quaternion();
const stickyCapsuleInverse = new THREE.Quaternion();
const stickyCapsuleAxis = new THREE.Vector3();
const stickyCapsuleA = new THREE.Vector3();
const stickyCapsuleB = new THREE.Vector3();
const stickyPoint = new THREE.Vector3();
const stickyClosest = new THREE.Vector3();
const stickyObjectQuat = new THREE.Quaternion();
const stickyOffset = new THREE.Vector3();
const stickyRotation = new THREE.Quaternion();
const stickyTarget = new THREE.Vector3();

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
  state.totalObjects = state.objects.length;

  loaderText.textContent = "Усадка кучи…";
  settlePile();

  setupInput();
  readPlayerState();
  syncMeshes();
  updateCamera(1);
  updateStats();
  updateRemovedCounter(true);

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
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0xd7e2e6, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd7e2e6, 0.014);

  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 260);
  state.camera = camera;
  state.scene = scene;

  addSky();
  addLights();
  addGroundVisual();
  addHighlightMesh();
  initExplosionFx();
  initBlackHoleFx();
  initPortalFx();
  initTornadoFx();
  window.addEventListener("resize", onResize);
}

function addSky() {
  const texture = makeSkyTexture();
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = texture;
  state.skyTexture = texture;
}

function makeSkyTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  const data = image.data;

  const topColor = [42, 104, 160];
  const horizonColor = [214, 228, 234];
  const cloudShade = [128, 150, 165];
  const cloudLight = [255, 255, 255];

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, x) => {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };

  const hash = (ix, iy, seed) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };

  const wrap = (value, period) => ((value % period) + period) % period;

  const valueNoise = (x, y, periodX, seed) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const xa = wrap(x0, periodX);
    const xb = wrap(x0 + 1, periodX);

    const n00 = hash(xa, y0, seed);
    const n10 = hash(xb, y0, seed);
    const n01 = hash(xa, y0 + 1, seed);
    const n11 = hash(xb, y0 + 1, seed);

    return mix(mix(n00, n10, sx), mix(n01, n11, sx), sy);
  };

  const fbm = (x, y, periodX, seed) => {
    let value = 0;
    let amplitude = 0.5;
    let norm = 0;

    for (let octave = 0; octave < 5; octave++) {
      const frequency = 1 << octave;
      value +=
        amplitude *
        valueNoise(
          x * frequency,
          y * frequency,
          periodX * frequency,
          seed + octave * 1013
        );
      norm += amplitude;
      amplitude *= 0.5;
    }

    return value / norm;
  };

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const elevation = 0.5 - v;
    const skyT = Math.pow(clamp01(elevation / 0.3), 0.6);
    const skyR = mix(horizonColor[0], topColor[0], skyT);
    const skyG = mix(horizonColor[1], topColor[1], skyT);
    const skyB = mix(horizonColor[2], topColor[2], skyT);

    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;

      if (elevation <= 0) {
        data[offset] = horizonColor[0];
        data[offset + 1] = horizonColor[1];
        data[offset + 2] = horizonColor[2];
        data[offset + 3] = 255;
        continue;
      }

      const u = (x + 0.5) / width;
      const base = fbm(u * 12, v * 9, 12, 0x1a2b3c);
      const detail = fbm(u * 36, v * 27, 36, 0x4d5e6f);
      const density = base * 0.7 + detail * 0.3;

      const cloudMask = smoothstep(0.0, 0.025, elevation);
      const cloud = smoothstep(0.46, 0.57, density) * cloudMask;
      const light = smoothstep(0.46, 0.64, base + (detail - 0.5) * 0.28);
      const cloudR = mix(cloudShade[0], cloudLight[0], light);
      const cloudG = mix(cloudShade[1], cloudLight[1], light);
      const cloudB = mix(cloudShade[2], cloudLight[2], light);

      const r = mix(skyR, cloudR, cloud * 0.97);
      const g = mix(skyG, cloudG, cloud * 0.97);
      const b = mix(skyB, cloudB, cloud * 0.97);

      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addLights() {
  const hemisphere = new THREE.HemisphereLight(0xd8ecff, 0x6d6455, 1.35);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xfff0d6, 2.65);
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

  const fill = new THREE.DirectionalLight(0xa8caff, 0.35);
  fill.position.set(-9, 7, -11);
  scene.add(fill);
}

function addGroundVisual() {
  const texture = makeAsphaltTexture();
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.97,
    metalness: 0.01,
    color: 0xffffff,
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

function makeSparkTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.35, "rgba(255, 220, 150, 0.9)");
  gradient.addColorStop(1, "rgba(255, 120, 20, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function initExplosionFx() {
  const shells = [];
  const rings = [];
  const lights = [];
  const shellGeometry = new THREE.SphereGeometry(1, 18, 12);
  const ringGeometry = new THREE.RingGeometry(0.78, 1, 40);
  ringGeometry.rotateX(-Math.PI / 2);

  for (let i = 0; i < 5; i++) {
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const shellMesh = new THREE.Mesh(shellGeometry, shellMaterial);
    shellMesh.visible = false;
    shellMesh.frustumCulled = false;
    shellMesh.renderOrder = 5;
    scene.add(shellMesh);
    shells.push({
      mesh: shellMesh,
      material: shellMaterial,
      age: 0,
      duration: 0.4,
      maxScale: 1,
      startOpacity: 0.5,
      startScale: 0.2,
      active: false,
    });

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    ringMesh.visible = false;
    ringMesh.frustumCulled = false;
    ringMesh.renderOrder = 4;
    scene.add(ringMesh);
    rings.push({
      mesh: ringMesh,
      material: ringMaterial,
      age: 0,
      duration: 0.5,
      maxScale: 1,
      startOpacity: 0.55,
      active: false,
    });
  }

  for (let i = 0; i < 2; i++) {
    const light = new THREE.PointLight(0xff9a3c, 0, 14, 2);
    scene.add(light);
    lights.push({
      light,
      age: 0,
      duration: 0.38,
      startIntensity: 0,
      active: false,
    });
  }

  const positions = new Float32Array(MAX_SPARKS * 3);
  const colors = new Float32Array(MAX_SPARKS * 3);

  for (let i = 0; i < MAX_SPARKS; i++) positions[i * 3 + 1] = -999;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.17,
    map: makeSparkTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;
  scene.add(points);

  state.fx = {
    shells,
    rings,
    lights,
    sparks: {
      points,
      geometry,
      material,
      positions,
      colors,
      velocities: new Float32Array(MAX_SPARKS * 3),
      life: new Float32Array(MAX_SPARKS),
      maxLife: new Float32Array(MAX_SPARKS),
      cursor: 0,
    },
  };
}

function spawnExplosion(x, y, z) {
  const fx = state.fx;
  if (!fx) return;

  const availableShells = fx.shells.filter((effect) => !effect.active);
  const inner = availableShells[0] || fx.shells[0];
  inner.active = true;
  inner.age = 0;
  inner.duration = 0.26;
  inner.maxScale = BLAST_RADIUS * 0.45;
  inner.startOpacity = 0.85;
  inner.material.color.setHex(0xffe0a0);
  inner.mesh.position.set(x, y, z);
  inner.startScale = 0.18;
  inner.mesh.scale.setScalar(inner.startScale);
  inner.mesh.visible = true;
  inner.material.opacity = inner.startOpacity;

  const outer = availableShells[1] || fx.shells[1];
  outer.active = true;
  outer.age = 0;
  outer.duration = 0.5;
  outer.maxScale = BLAST_RADIUS * 0.55;
  outer.startOpacity = 0.3;
  outer.material.color.setHex(0xff6a1a);
  outer.mesh.position.set(x, y, z);
  outer.startScale = 0.3;
  outer.mesh.scale.setScalar(outer.startScale);
  outer.mesh.visible = true;
  outer.material.opacity = outer.startOpacity;

  const ring = fx.rings.find((effect) => !effect.active) || fx.rings[0];
  ring.active = true;
  ring.age = 0;
  ring.duration = 0.55;
  ring.maxScale = BLAST_RADIUS * 1.05;
  ring.startOpacity = 0.55;
  ring.mesh.position.set(x, 0.04, z);
  ring.mesh.scale.setScalar(0.45);
  ring.mesh.visible = true;
  ring.material.opacity = ring.startOpacity;

  const light = fx.lights.find((effect) => !effect.active) || fx.lights[0];
  light.active = true;
  light.age = 0;
  light.duration = 0.38;
  light.startIntensity = 120;
  light.light.position.set(x, y + 0.4, z);
  light.light.intensity = light.startIntensity;

  const sparks = fx.sparks;
  for (let i = 0; i < 80; i++) {
    const slot = sparks.cursor++ % MAX_SPARKS;
    const theta = Math.random() * Math.PI * 2;
    const up = Math.random() * 0.9 + 0.1;
    const speed = 4 + Math.random() * 12;
    const horizontal = Math.sqrt(1 - up * up);

    sparks.positions[slot * 3] = x;
    sparks.positions[slot * 3 + 1] = y;
    sparks.positions[slot * 3 + 2] = z;
    sparks.velocities[slot * 3] = Math.cos(theta) * horizontal * speed;
    sparks.velocities[slot * 3 + 1] = up * speed;
    sparks.velocities[slot * 3 + 2] = Math.sin(theta) * horizontal * speed;
    sparks.life[slot] = 0.5 + Math.random() * 0.5;
    sparks.maxLife[slot] = sparks.life[slot];
    sparks.colors[slot * 3] = 1;
    sparks.colors[slot * 3 + 1] = 0.45 + Math.random() * 0.45;
    sparks.colors[slot * 3 + 2] = 0.08 + Math.random() * 0.18;
  }

  sparks.geometry.attributes.position.needsUpdate = true;
  sparks.geometry.attributes.color.needsUpdate = true;
}

function updateExplosionFx(dt) {
  const fx = state.fx;
  if (!fx) return;

  for (const effect of fx.shells) {
    if (!effect.active) continue;

    effect.age += dt;
    const t = Math.min(effect.age / effect.duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    effect.mesh.scale.setScalar(THREE.MathUtils.lerp(effect.startScale, effect.maxScale, eased));
    effect.material.opacity = effect.startOpacity * (1 - t);

    if (t >= 1) {
      effect.active = false;
      effect.mesh.visible = false;
    }
  }

  for (const effect of fx.rings) {
    if (!effect.active) continue;

    effect.age += dt;
    const t = Math.min(effect.age / effect.duration, 1);
    effect.mesh.scale.setScalar(THREE.MathUtils.lerp(0.45, effect.maxScale, t));
    effect.material.opacity = effect.startOpacity * (1 - t);

    if (t >= 1) {
      effect.active = false;
      effect.mesh.visible = false;
    }
  }

  for (const effect of fx.lights) {
    if (!effect.active) continue;

    effect.age += dt;
    const t = Math.min(effect.age / effect.duration, 1);
    effect.light.intensity = effect.startIntensity * (1 - t) * (1 - t);

    if (t >= 1) {
      effect.active = false;
      effect.light.intensity = 0;
    }
  }

  const sparks = fx.sparks;
  let sparksChanged = false;

  for (let i = 0; i < MAX_SPARKS; i++) {
    if (sparks.life[i] <= 0) continue;

    sparks.life[i] -= dt;
    sparksChanged = true;

    if (sparks.life[i] <= 0) {
      sparks.positions[i * 3 + 1] = -999;
      sparks.colors[i * 3] = 0;
      sparks.colors[i * 3 + 1] = 0;
      sparks.colors[i * 3 + 2] = 0;
      continue;
    }

    sparks.positions[i * 3] += sparks.velocities[i * 3] * dt;
    sparks.positions[i * 3 + 1] += sparks.velocities[i * 3 + 1] * dt;
    sparks.positions[i * 3 + 2] += sparks.velocities[i * 3 + 2] * dt;
    sparks.velocities[i * 3 + 1] -= 9.8 * dt;

    const fade = sparks.life[i] / sparks.maxLife[i];
    sparks.colors[i * 3] = fade;
    sparks.colors[i * 3 + 1] = 0.55 * fade;
    sparks.colors[i * 3 + 2] = 0.12 * fade;
  }

  if (sparksChanged) {
    sparks.geometry.attributes.position.needsUpdate = true;
    sparks.geometry.attributes.color.needsUpdate = true;
  }
}

function resetExplosionFx() {
  const fx = state.fx;
  if (!fx) return;

  for (const effect of fx.shells) {
    effect.active = false;
    effect.mesh.visible = false;
    effect.material.opacity = 0;
  }

  for (const effect of fx.rings) {
    effect.active = false;
    effect.mesh.visible = false;
    effect.material.opacity = 0;
  }

  for (const effect of fx.lights) {
    effect.active = false;
    effect.light.intensity = 0;
  }

  const sparks = fx.sparks;
  sparks.life.fill(0);

  for (let i = 0; i < MAX_SPARKS; i++) {
    sparks.positions[i * 3 + 1] = -999;
    sparks.colors[i * 3] = 0;
    sparks.colors[i * 3 + 1] = 0;
    sparks.colors[i * 3 + 2] = 0;
  }

  sparks.geometry.attributes.position.needsUpdate = true;
  sparks.geometry.attributes.color.needsUpdate = true;
}

function makeBlackHoleTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.3, "rgba(80, 35, 160, 0.08)");
  gradient.addColorStop(0.5, "rgba(150, 85, 255, 0.55)");
  gradient.addColorStop(0.62, "rgba(255, 145, 70, 0.22)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function initBlackHoleFx() {
  const coreGeometry = new THREE.SphereGeometry(0.42, 24, 16);
  const diskGeometry = new THREE.RingGeometry(
    0.55,
    1.35,
    48,
    1,
    0,
    Math.PI * 1.65
  );
  diskGeometry.rotateX(-Math.PI / 2);
  const ringGeometry = new THREE.TorusGeometry(0.92, 0.035, 8, 48);
  const haloTexture = makeBlackHoleTexture();
  const holes = [];

  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();
    group.visible = false;

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x05020c,
      transparent: true,
      opacity: 0,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);

    const diskMaterial = new THREE.MeshBasicMaterial({
      color: 0x8b5cff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const disk = new THREE.Mesh(diskGeometry, diskMaterial);
    disk.renderOrder = 7;
    group.add(disk);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffa36b,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2 - 0.35;
    ring.renderOrder = 8;
    group.add(ring);

    const haloMaterial = new THREE.SpriteMaterial({
      map: haloTexture,
      color: 0xa77bff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.set(4.5, 4.5, 1);
    halo.renderOrder = 6;
    group.add(halo);

    scene.add(group);
    holes.push({
      active: false,
      group,
      coreMaterial,
      diskMaterial,
      ringMaterial,
      haloMaterial,
      disk,
      ring,
      halo,
      position: new THREE.Vector3(),
      age: 0,
      absorbBudget: 0,
      duration: BLACKHOLE_DURATION,
      radius: BLACKHOLE_RADIUS,
    });
  }

  state.blackHoles = holes;
}

function spawnBlackHole(x, y, z) {
  const holes = state.blackHoles;
  if (!holes.length) return;

  let hole = holes.find((entry) => !entry.active);

  if (!hole) {
    hole = holes.reduce(
      (oldest, entry) => (entry.age > oldest.age ? entry : oldest),
      holes[0]
    );
  }

  hole.active = true;
  hole.age = 0;
  hole.absorbBudget = 0.5;
  hole.position.set(x, y, z);
  hole.group.position.copy(hole.position);
  hole.group.visible = true;
  hole.group.scale.setScalar(0.2);
  hole.disk.rotation.set(0, 0, 0);
  hole.ring.rotation.set(Math.PI / 2 - 0.35, 0, 0);
  hole.coreMaterial.opacity = 0;
  hole.diskMaterial.opacity = 0;
  hole.ringMaterial.opacity = 0;
  hole.haloMaterial.opacity = 0;
}

function deactivateBlackHole(hole) {
  hole.active = false;
  hole.group.visible = false;
}

function updateBlackHoleFx(dt) {
  for (const hole of state.blackHoles) {
    if (!hole.active) continue;

    const fadeIn = Math.min(hole.age / 0.3, 1);
    const fadeOut = Math.min((hole.duration - hole.age) / 0.55, 1);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));

    hole.group.scale.setScalar(0.2 + 0.8 * alpha);
    hole.coreMaterial.opacity = alpha;
    hole.diskMaterial.opacity = 0.5 * alpha;
    hole.ringMaterial.opacity = 0.8 * alpha;
    hole.haloMaterial.opacity = 0.7 * alpha;
    hole.disk.rotation.y += dt * 2.1;
    hole.ring.rotation.z += dt * 2.6;

    const pulse = 1 + Math.sin(hole.age * 7) * 0.08;
    hole.halo.scale.set(4.5 * pulse, 4.5 * pulse, 1);
  }
}

function resetBlackHoleFx() {
  for (const hole of state.blackHoles) {
    hole.active = false;
    hole.group.visible = false;
  }
}

function initPortalFx() {
  const discGeometry = new THREE.PlaneGeometry(2, 2);
  discGeometry.rotateX(-Math.PI / 2);

  const arcGeometry = new THREE.RingGeometry(
    0.52,
    0.94,
    64,
    1,
    0,
    Math.PI * 1.28
  );
  arcGeometry.rotateX(-Math.PI / 2);

  const ringGeometry = new THREE.TorusGeometry(1, 0.026, 10, 96);
  ringGeometry.rotateX(Math.PI / 2);

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform float uAlpha;
    uniform vec3 uTint;
    varying vec2 vUv;

    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) discard;

      float angle = atan(p.y, p.x);
      float spiral = sin(angle * 5.0 - r * 20.0 + uTime * 3.4);
      float spiral2 = sin(angle * 3.0 + r * 13.0 - uTime * 2.2);
      float rim = smoothstep(0.7, 0.9, r) * (1.0 - smoothstep(0.94, 1.0, r));
      float haze = smoothstep(0.15, 0.98, r);

      vec3 deep = vec3(0.003, 0.006, 0.018);
      vec3 tint = uTint * 1.35;
      vec3 color = mix(deep, tint * 0.22, 0.16 + 0.1 * spiral2);
      color += tint * (0.5 + 0.5 * spiral) * haze * 0.16;
      color = mix(color, tint, rim * (0.65 + 0.35 * spiral));

      float alpha = uAlpha * (0.93 + 0.07 * rim);
      gl_FragColor = vec4(color, alpha);
    }
  `;

  const portals = [];

  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group();
    group.visible = false;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uTint: { value: new THREE.Color(0x59c3ff) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeometry, material);
    disc.position.y = 0.012;
    disc.frustumCulled = false;
    disc.renderOrder = 2;
    group.add(disc);

    const arcMaterial = new THREE.MeshBasicMaterial({
      color: 0x59c3ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const arc = new THREE.Mesh(arcGeometry, arcMaterial);
    arc.position.y = 0.022;
    arc.frustumCulled = false;
    arc.renderOrder = 3;
    group.add(arc);

    const arc2Material = arcMaterial.clone();
    const arc2 = new THREE.Mesh(arcGeometry, arc2Material);
    arc2.position.y = 0.024;
    arc2.scale.setScalar(0.78);
    arc2.frustumCulled = false;
    arc2.renderOrder = 3;
    group.add(arc2);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x9fe9ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = 0.03;
    ring.frustumCulled = false;
    ring.renderOrder = 4;
    group.add(ring);

    const light = new THREE.PointLight(0x59c3ff, 0, 9, 2);
    light.position.y = 0.55;
    group.add(light);

    scene.add(group);
    portals.push({
      active: false,
      group,
      material,
      arc,
      arcMaterial,
      arc2,
      arc2Material,
      ring,
      ringMaterial,
      light,
      tint: new THREE.Color(),
      position: new THREE.Vector3(),
      age: 0,
      duration: PORTAL_DURATION,
      radius: PORTAL_RADIUS,
    });
  }

  state.portals = portals;
}

function spawnPortal(x, z, tint) {
  const portals = state.portals;
  if (!portals.length) return;

  let portal = portals.find((entry) => !entry.active);

  if (!portal) {
    portal = portals.reduce(
      (oldest, entry) => (entry.age > oldest.age ? entry : oldest),
      portals[0]
    );
  }

  portal.active = true;
  portal.age = 0;
  portal.position.set(x, 0.03, z);
  portal.group.position.copy(portal.position);
  portal.group.visible = true;
  portal.group.scale.setScalar(portal.radius * 0.12);
  portal.tint.copy(tint).lerp(PORTAL_BASE_COLOR, 0.3);
  portal.material.uniforms.uTime.value = 0;
  portal.material.uniforms.uAlpha.value = 0;
  portal.material.uniforms.uTint.value.copy(portal.tint);
  portal.arcMaterial.color.copy(portal.tint);
  portal.arc2Material.color.copy(portal.tint).lerp(PORTAL_BASE_COLOR, 0.35);
  portal.ringMaterial.color.copy(portal.tint).lerp(PORTAL_BASE_COLOR, 0.5);
  portal.arcMaterial.opacity = 0;
  portal.arc2Material.opacity = 0;
  portal.ringMaterial.opacity = 0;
  portal.light.color.copy(portal.tint);
  portal.light.intensity = 0;
  portal.arc.rotation.y = 0;
  portal.arc2.rotation.y = Math.PI;
}

function deactivatePortal(portal) {
  portal.active = false;
  portal.group.visible = false;
}

function updatePortalFx(dt) {
  for (const portal of state.portals) {
    if (!portal.active) continue;

    const fadeIn = Math.min(portal.age / 0.5, 1);
    const fadeOut = Math.min((portal.duration - portal.age) / 0.65, 1);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    const open = 1 - Math.pow(1 - Math.min(portal.age / 0.6, 1), 3);
    const pulse = 1 + Math.sin(portal.age * 4.5) * 0.035;
    const scale = portal.radius * (0.12 + 0.88 * open) * pulse;

    portal.group.scale.setScalar(scale);
    portal.material.uniforms.uTime.value = portal.age;
    portal.material.uniforms.uAlpha.value = alpha;
    portal.arcMaterial.opacity = 0.62 * alpha;
    portal.arc2Material.opacity = 0.42 * alpha;
    portal.ringMaterial.opacity = 0.85 * alpha;
    portal.light.intensity =
      18 * alpha * (0.9 + 0.1 * Math.sin(portal.age * 7));
    portal.arc.rotation.y += dt * 2.4;
    portal.arc2.rotation.y -= dt * 1.7;
  }
}

function resetPortalFx() {
  for (const portal of state.portals) {
    portal.active = false;
    portal.group.visible = false;
  }
}

function makeDustTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.32, "rgba(220, 240, 255, 0.72)");
  gradient.addColorStop(1, "rgba(200, 225, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function initTornadoFx() {
  const funnelGeometry = new THREE.CylinderGeometry(
    2,
    0.5,
    TORNADO_HEIGHT,
    48,
    10,
    true
  );
  const ringGeometry = new THREE.RingGeometry(0.25, 1.9, 48);
  ringGeometry.rotateX(-Math.PI / 2);
  const dustTexture = makeDustTexture();

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform float uAlpha;
    uniform vec3 uTint;
    varying vec2 vUv;

    void main() {
      float spin = uTime * 9.0;
      float band = 0.5 + 0.5 * sin(vUv.x * 94.2478 + vUv.y * 16.0 - spin);
      float filament = smoothstep(0.35, 1.0, band);
      float thin = smoothstep(
        0.55,
        1.0,
        0.5 + 0.5 * sin(vUv.x * 37.699 + vUv.y * 28.0 - spin * 1.4)
      );
      float edge =
        smoothstep(0.0, 0.1, vUv.y) *
        (1.0 - smoothstep(0.76, 1.0, vUv.y));
      float alpha = uAlpha * (0.07 + 0.24 * filament + 0.12 * thin) * edge;
      vec3 base = vec3(0.45, 0.54, 0.64);
      vec3 color = mix(base, uTint, 0.25 + 0.4 * filament);
      gl_FragColor = vec4(color, alpha);
    }
  `;

  const tornadoes = [];

  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();
    group.visible = false;

    const funnelMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uTint: { value: new THREE.Color(0xd8ecff) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const funnel = new THREE.Mesh(funnelGeometry, funnelMaterial);
    funnel.position.y = TORNADO_HEIGHT / 2;
    funnel.frustumCulled = false;
    funnel.renderOrder = 3;
    group.add(funnel);

    const innerFunnel = new THREE.Mesh(funnelGeometry, funnelMaterial);
    innerFunnel.position.y = TORNADO_HEIGHT / 2;
    innerFunnel.scale.set(0.62, 1, 0.62);
    innerFunnel.rotation.y = Math.PI * 0.5;
    innerFunnel.frustumCulled = false;
    innerFunnel.renderOrder = 3;
    group.add(innerFunnel);

    const dustPositions = new Float32Array(TORNADO_PARTICLES * 3);
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(dustPositions, 3)
    );
    const dustMaterial = new THREE.PointsMaterial({
      color: 0xb9c9d6,
      size: 0.17,
      map: dustTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.frustumCulled = false;
    dust.renderOrder = 4;
    group.add(dust);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8ecff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = 0.025;
    ring.frustumCulled = false;
    ring.renderOrder = 2;
    group.add(ring);

    scene.add(group);

    const particles = [];
    for (let p = 0; p < TORNADO_PARTICLES; p++) {
      particles.push({
        angle: 0,
        radius: 0,
        y: 0,
        rise: 0,
        spin: 0,
      });
    }

    tornadoes.push({
      active: false,
      group,
      funnelMaterial,
      dustMaterial,
      dustPositions,
      dustGeometry,
      particles,
      ring,
      ringMaterial,
      tint: new THREE.Color(),
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      age: 0,
      duration: TORNADO_DURATION,
      radius: TORNADO_RADIUS,
      speed: TORNADO_SPEED,
    });
  }

  state.tornadoes = tornadoes;
}

function resetTornadoParticles(tornado) {
  const positions = tornado.dustPositions;

  for (let i = 0; i < TORNADO_PARTICLES; i++) {
    const particle = tornado.particles[i];
    particle.angle = Math.random() * Math.PI * 2;
    particle.radius = 0.35 + Math.random() * 0.65;
    particle.y = Math.random() * TORNADO_HEIGHT;
    particle.rise = 1.4 + Math.random() * 2.2;
    particle.spin = 2.6 + Math.random() * 4.8;

    const spread = 0.35 + (particle.y / TORNADO_HEIGHT) * 1.45;
    const radius = particle.radius * spread;
    positions[i * 3] = Math.cos(particle.angle) * radius;
    positions[i * 3 + 1] = particle.y;
    positions[i * 3 + 2] = Math.sin(particle.angle) * radius;
  }

  tornado.dustGeometry.attributes.position.needsUpdate = true;
}

function spawnTornado(x, z, dirX, dirZ, tint) {
  const tornadoes = state.tornadoes;
  if (!tornadoes.length) return;

  let tornado = tornadoes.find((entry) => !entry.active);

  if (!tornado) {
    tornado = tornadoes.reduce(
      (oldest, entry) => (entry.age > oldest.age ? entry : oldest),
      tornadoes[0]
    );
  }

  tornado.active = true;
  tornado.age = 0;
  tornado.position.set(x, 0, z);
  tornado.direction.set(dirX, 0, dirZ);
  if (tornado.direction.lengthSq() < 0.000001) {
    tornado.direction.set(0, 0, -1);
  } else {
    tornado.direction.normalize();
  }

  tornado.group.position.copy(tornado.position);
  tornado.group.visible = true;
  tornado.tint.copy(tint).lerp(TORNADO_BASE_COLOR, 0.6);
  tornado.funnelMaterial.uniforms.uTime.value = 0;
  tornado.funnelMaterial.uniforms.uAlpha.value = 0;
  tornado.funnelMaterial.uniforms.uTint.value.copy(tornado.tint);
  tornado.dustMaterial.color.copy(tornado.tint).lerp(TORNADO_BASE_COLOR, 0.25);
  tornado.dustMaterial.opacity = 0;
  tornado.ringMaterial.color.copy(tornado.tint);
  tornado.ringMaterial.opacity = 0;
  tornado.ring.scale.setScalar(1);
  resetTornadoParticles(tornado);
}

function deactivateTornado(tornado) {
  tornado.active = false;
  tornado.group.visible = false;
  tornado.funnelMaterial.uniforms.uAlpha.value = 0;
  tornado.dustMaterial.opacity = 0;
  tornado.ringMaterial.opacity = 0;
}

function updateTornadoFx(dt) {
  for (const tornado of state.tornadoes) {
    if (!tornado.active) continue;

    const fadeIn = Math.min(tornado.age / 0.45, 1);
    const fadeOut = Math.min((tornado.duration - tornado.age) / 0.6, 1);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));

    tornado.group.position.set(
      tornado.position.x,
      0,
      tornado.position.z
    );
    tornado.funnelMaterial.uniforms.uTime.value = tornado.age;
    tornado.funnelMaterial.uniforms.uAlpha.value = alpha;
    tornado.dustMaterial.opacity = 0.8 * alpha;
    tornado.ringMaterial.opacity = 0.22 * alpha;
    tornado.ring.scale.setScalar(1 + Math.sin(tornado.age * 8) * 0.05);

    const positions = tornado.dustPositions;

    for (let i = 0; i < TORNADO_PARTICLES; i++) {
      const particle = tornado.particles[i];
      particle.y += particle.rise * dt;
      particle.angle += particle.spin * dt;

      if (particle.y > TORNADO_HEIGHT) {
        particle.y -= TORNADO_HEIGHT;
        particle.angle = Math.random() * Math.PI * 2;
        particle.radius = 0.35 + Math.random() * 0.65;
      }

      const spread = 0.35 + (particle.y / TORNADO_HEIGHT) * 1.45;
      const radius = particle.radius * spread;
      positions[i * 3] = Math.cos(particle.angle) * radius;
      positions[i * 3 + 1] = particle.y;
      positions[i * 3 + 2] = Math.sin(particle.angle) * radius;
    }

    tornado.dustGeometry.attributes.position.needsUpdate = true;
  }
}

function resetTornadoFx() {
  for (const tornado of state.tornadoes) {
    deactivateTornado(tornado);
  }
}

function makeAsphaltTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  let seed = 0x51f15e;

  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    const grain = (random() - 0.5) * 28;
    data[i] = 88 + grain;
    data[i + 1] = 91 + grain;
    data[i + 2] = 92 + grain;
    data[i + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);

  for (let i = 0; i < 32; i++) {
    const x = random() * size;
    const y = random() * size;
    const radius = 36 + random() * 84;
    const light = random() > 0.45;

    const paint = (px, py) => {
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
      gradient.addColorStop(
        0,
        light ? "rgba(205, 205, 198, 0.035)" : "rgba(24, 26, 28, 0.055)"
      );
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    };

    paint(x, y);
    if (x < radius) paint(x + size, y);
    if (x > size - radius) paint(x - size, y);
    if (y < radius) paint(x, y + size);
    if (y > size - radius) paint(x, y - size);
  }

  for (let i = 0; i < 3600; i++) {
    const x = random() * size;
    const y = random() * size;
    const radius = 0.45 + random() * 1.5;
    const tone = 48 + Math.floor(random() * 132);
    const alpha = 0.14 + random() * 0.34;

    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        const px = x + ox;
        const py = y + oy;
        if (px < -radius || px > size + radius) continue;
        if (py < -radius || py > size + radius) continue;
        ctx.fillStyle = `rgba(${tone}, ${tone}, ${tone + 3}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.lineCap = "round";
  for (let i = 0; i < 11; i++) {
    let x = random() * size;
    let y = random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 5 + Math.floor(random() * 9);
    for (let step = 0; step < steps; step++) {
      x += (random() - 0.5) * 20;
      y += (random() - 0.5) * 20;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(32, 34, 35, 0.16)";
    ctx.lineWidth = 0.6 + random() * 0.7;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
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
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_PORTAL, bpMoving);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_STUCK, bpMoving);
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

function spawnObjects() {
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

    scene.add(mesh);
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
    if (Math.hypot(v.GetX(), v.GetY(), v.GetZ()) > 0.4) return false;
    active++;
  }

  return active < 30;
}

function settlePile() {
  const maxSteps = 240;

  for (let i = 0; i < maxSteps; i++) {
    state.jolt.Step(FIXED_DT, 1);
    if ((i + 1) % 60 === 0 && isPileCalm()) break;
  }

  for (const object of state.objects) {
    const p = object.body.GetPosition();
    const q = object.body.GetRotation();
    object.spawnPosition.set(p.GetX(), p.GetY(), p.GetZ());
    object.spawnRotation.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
    object.position.copy(object.spawnPosition);
    object.quaternion.copy(object.spawnRotation);
    state.bodyInterface.SetLinearAndAngularVelocity(
      object.id,
      zeroVec3(),
      zeroVec3()
    );
    state.bodyInterface.DeactivateBody(object.id);
  }

  readPlayerState();
}

function createObject(type, index, mesh, palette, spawnX, spawnZ, spawnBaseY) {
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
  let capsuleHalf = 0;
  let capsuleRadius = 0;

  if (type === "box") {
    const size = 0.35 + Math.random() * 0.45;
    const half = size / 2;
    shape = new J.BoxShape(new J.Vec3(half, half, half), 0.02);
    scale = new THREE.Vector3(size, size, size);
    bounds = new THREE.Vector3(size, size, size);
    radius = half;
    restHeight = half;
  } else if (type === "sphere") {
    const r = 0.14 + Math.random() * 0.22;
    shape = new J.SphereShape(r);
    scale = new THREE.Vector3(r, r, r);
    bounds = new THREE.Vector3(r * 2, r * 2, r * 2);
    radius = r;
    restHeight = r;
  } else if (type === "capsule") {
    const r = 0.11 + Math.random() * 0.11;
    const half = 0.18 + Math.random() * 0.14;
    capsuleHalf = half;
    capsuleRadius = r;
    shape = new J.CapsuleShape(half, r);
    scale = new THREE.Vector3(r * 2, half + r, r * 2);
    bounds = new THREE.Vector3(r * 2, (half + r) * 2, r * 2);
    radius = half + r;
    restHeight = r;
  } else if (type === "gear") {
    const gearRadius = 0.2 + Math.random() * 0.26;
    const thickness = 0.07 + Math.random() * 0.09;
    shape = new J.CylinderShape(thickness / 2, gearRadius, 0.02);
    scale = new THREE.Vector3(gearRadius, thickness, gearRadius);
    bounds = new THREE.Vector3(gearRadius * 2, thickness, gearRadius * 2);
    radius = gearRadius;
    restHeight = thickness / 2;
    density = 260;
    restitution = 0.05;
    angularDamping = 0.25;
  } else if (type === "wire") {
    const length = 0.55 + Math.random() * 0.45;
    shape = new J.CapsuleShape(length / 2, 0.05);
    scale = new THREE.Vector3(1, length, 1);
    bounds = new THREE.Vector3(0.32, length, 0.32);
    radius = length / 2;
    restHeight = 0.06;
    density = 500;
    friction = 0.5;
    restitution = 0.08;
  } else if (type === "pipe") {
    const pipeRadius = 0.14 + Math.random() * 0.12;
    const length = 0.55 + Math.random() * 0.45;
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
    const size = 0.55 + Math.random() * 0.35;
    const depth = 0.06 + Math.random() * 0.07;
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

  const spawnY = spawnBaseY + restHeight + 0.02 + Math.random() * 0.04;
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

  if (type === "capsule") shape.AddRef();

  const object = {
    type,
    name: OBJECT_NAMES[type],
    body,
    id,
    shape,
    density,
    radius,
    scale,
    bounds,
    baseScale: type === "capsule" ? scale.clone() : null,
    baseBounds: type === "capsule" ? bounds.clone() : null,
    baseRadius: radius,
    capsuleHalf,
    capsuleRadius,
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
    if (
      object === state.held ||
      object.exploded ||
      object.absorbed ||
      object.portalFall ||
      object.stuckTo
    ) {
      continue;
    }

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
  if (object.type === "capsule") activateStickyCapsule(object);
  if (object.type === "gear") {
    if (!object.throwDirection) object.throwDirection = new THREE.Vector3();
    object.throwDirection.set(vx, 0, vz);
    if (object.throwDirection.lengthSq() < 0.01) {
      getFlatForward(object.throwDirection);
    } else {
      object.throwDirection.normalize();
    }
  }
  setBodyVelocity(object.id, vx, vy, vz);

  const spin = state.tmpVec3b;
  spin.Set(
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10
  );
  state.bodyInterface.SetAngularVelocity(object.id, spin);
  state.bodyInterface.ActivateBody(object.id);

  if (
    object.type === "sphere" ||
    object.type === "box" ||
    object.type === "frame" ||
    object.type === "gear"
  ) {
    armObject(object);
  }

  state.held = null;
}

function activateStickyCapsule(object) {
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

function releaseStuckObjects(capsule) {
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

function attachStuckObject(capsule, object) {
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
    zeroVec3(),
    zeroVec3()
  );
}

function updateStickyCapsules() {
  for (const capsule of state.stickyCapsules) {
    if (!capsule.sticky || capsule.exploded || capsule.absorbed) continue;

    const p = capsule.body.GetPosition();
    const q = capsule.body.GetRotation();
    stickyCapsulePos.set(p.GetX(), p.GetY(), p.GetZ());
    stickyCapsuleQuat.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
    stickyCapsuleAxis.set(0, 1, 0).applyQuaternion(stickyCapsuleQuat);

    const half = capsule.capsuleHalf * CAPSULE_GROW;
    const radius = capsule.capsuleRadius * CAPSULE_GROW;
    stickyCapsuleA.copy(stickyCapsulePos).addScaledVector(
      stickyCapsuleAxis,
      -half
    );
    stickyCapsuleB.copy(stickyCapsulePos).addScaledVector(
      stickyCapsuleAxis,
      half
    );

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

    const segmentX = stickyCapsuleB.x - stickyCapsuleA.x;
    const segmentY = stickyCapsuleB.y - stickyCapsuleA.y;
    const segmentZ = stickyCapsuleB.z - stickyCapsuleA.z;
    const segmentLengthSq =
      segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;

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
        t =
          (relX * segmentX + relY * segmentY + relZ * segmentZ) /
          segmentLengthSq;
        t = THREE.MathUtils.clamp(t, 0, 1);
      }

      stickyClosest.set(
        stickyCapsuleA.x + segmentX * t,
        stickyCapsuleA.y + segmentY * t,
        stickyCapsuleA.z + segmentZ * t
      );

      const contactRadius =
        radius + object.radius + CAPSULE_STICK_PADDING;
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

function armObject(object) {
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

function updateArmed(dt) {
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

function hideObjectInstance(object) {
  tmpMatrix.makeScale(0, 0, 0);
  object.instanceMesh.setMatrixAt(object.instanceIndex, tmpMatrix);
  object.instanceMesh.instanceMatrix.needsUpdate = true;
}

function createBlackHole(object) {
  const p = object.body.GetPosition();
  const x = p.GetX();
  const y = Math.max(0.7, p.GetY());
  const z = p.GetZ();

  object.position.set(x, y, z);
  state.bodyInterface.RemoveBody(object.id);
  object.exploded = true;
  object.fuse = 0;
  state.removed += 1;
  hideObjectInstance(object);
  spawnBlackHole(x, y, z);
}

function openPortalFromFrame(object) {
  const p = object.body.GetPosition();
  const limit = GROUND_HALF_SIZE - PORTAL_RADIUS - 0.5;
  const x = THREE.MathUtils.clamp(p.GetX(), -limit, limit);
  const z = THREE.MathUtils.clamp(p.GetZ(), -limit, limit);

  object.instanceMesh.getColorAt(object.instanceIndex, tmpColor);
  object.position.set(x, 0, z);
  state.bodyInterface.RemoveBody(object.id);
  object.exploded = true;
  object.fuse = 0;
  state.removed += 1;
  hideObjectInstance(object);
  spawnPortal(x, z, tmpColor);
}

function createTornadoFromGear(object) {
  const p = object.body.GetPosition();
  const limit = GROUND_HALF_SIZE - TORNADO_RADIUS - 0.5;
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
  object.position.set(x, 0, z);
  state.bodyInterface.RemoveBody(object.id);
  object.exploded = true;
  object.fuse = 0;
  state.removed += 1;
  hideObjectInstance(object);
  spawnTornado(x, z, dx / length, dz / length, tmpColor);
}

function explodeBall(object) {
  const p = object.body.GetPosition();
  const x = p.GetX();
  const y = Math.max(0.25, p.GetY());
  const z = p.GetZ();

  object.position.set(x, y, z);
  state.bodyInterface.RemoveBody(object.id);
  object.exploded = true;
  object.fuse = 0;
  state.removed += 1;
  hideObjectInstance(object);

  applyBlast(x, y, z);
  spawnExplosion(x, y, z);
}

function absorbObject(object) {
  if (object.absorbed || object.exploded) return;

  if (object.stuckObjects && object.stuckObjects.length) {
    const attached = object.stuckObjects.slice();
    object.stuckObjects.length = 0;
    for (const stuck of attached) {
      stuck.stuckTo = null;
      stuck.stuckOffset = null;
      stuck.stuckRotation = null;
      absorbObject(stuck);
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

function updateBlackHoles(dt) {
  for (const hole of state.blackHoles) {
    if (!hole.active) continue;

    hole.age += dt;
    if (hole.age >= hole.duration) {
      deactivateBlackHole(hole);
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
      const blend = 0.2;
      const velocity = state.bodyInterface.GetLinearVelocity(object.id);

      state.tmpVec3.Set(
        (targetX - velocity.GetX()) * mass * blend,
        (targetY - velocity.GetY()) * mass * blend,
        (targetZ - velocity.GetZ()) * mass * blend
      );
      state.bodyInterface.AddImpulse(object.id, state.tmpVec3);
      state.bodyInterface.ActivateBody(object.id);
    }
  }
}

function updateTornadoes(dt) {
  for (const tornado of state.tornadoes) {
    if (!tornado.active) continue;

    tornado.age += dt;
    if (tornado.age >= tornado.duration) {
      deactivateTornado(tornado);
      continue;
    }

    const limit = GROUND_HALF_SIZE - TORNADO_RADIUS - 0.5;
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
      const swirl =
        TORNADO_SWIRL * (0.45 + 0.55 * falloff) * fade;
      const targetX = inwardX * pull + tangentX * swirl;
      const targetZ = inwardZ * pull + tangentZ * swirl;
      const targetY = TORNADO_LIFT * (0.45 + 0.55 * falloff) * fade;
      const mass = 1 / inverseMass;
      const blend = 0.16;
      const velocity = state.bodyInterface.GetLinearVelocity(object.id);

      state.tmpVec3.Set(
        (targetX - velocity.GetX()) * mass * blend,
        (targetY - velocity.GetY()) * mass * blend,
        (targetZ - velocity.GetZ()) * mass * blend
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

function updatePortals(dt) {
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

function applyBlast(x, y, z) {
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

  state.armed.length = 0;
  state.removed = 0;
  resetExplosionFx();
  resetBlackHoleFx();
  resetPortalFx();
  resetTornadoFx();

  for (const object of state.objects) {
    if (object.stuckObjects && object.stuckObjects.length) {
      releaseStuckObjects(object);
    }
  }
  state.stickyCapsules.length = 0;

  for (const object of state.objects) {
    if (object.exploded || object.absorbed) {
      state.bodyInterface.AddBody(object.id, J.EActivation_Activate);
      object.exploded = false;
      object.absorbed = false;
    }

    if (object.type === "capsule") {
      if (object.grownShape) {
        state.bodyInterface.SetShape(
          object.id,
          object.shape,
          true,
          J.EActivation_Activate
        );
        object.grownShape.Release();
        object.grownShape = null;
      }
      object.sticky = false;
      object.scale.copy(object.baseScale);
      object.bounds.copy(object.baseBounds);
      object.radius = object.baseRadius;
    }

    object.stuckTo = null;
    state.bodyInterface.SetObjectLayer(object.id, LAYER_MOVING);
    object.portalFall = false;

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
    object.fuse = 0;
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
    setHint(
      state.held.type === "sphere"
        ? "ШАР · ЛКМ — бросить со взрывом · E — отпустить"
        : state.held.type === "box"
          ? "КУБ · ЛКМ — бросить, создаёт чёрную дыру · E — отпустить"
          : state.held.type === "frame"
            ? "РАМА · ЛКМ — бросить, создаёт портал · E — отпустить"
            : state.held.type === "gear"
              ? "ШЕСТЕРЁНКА · ЛКМ — бросить, запускает торнадо · E — отпустить"
              : state.held.type === "capsule"
                ? "КАПСУЛА · ЛКМ — бросить, растёт и липнет · E — отпустить"
                : "ЛКМ — бросить · E — отпустить",
      true
    );
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

function updateRemovedCounter(force = false) {
  if (!force && state.removed === state.removedShown) return;
  state.removedShown = state.removed;

  const count = document.getElementById("removed-count");
  const total = document.getElementById("removed-total");
  if (count) count.textContent = String(state.removed);
  if (total) total.textContent = String(state.totalObjects);
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
  updateArmed(FIXED_DT);
  updateBlackHoles(FIXED_DT);
  updateTornadoes(FIXED_DT);
  updatePortals(FIXED_DT);
  state.jolt.Step(FIXED_DT, 1);
  updateStickyCapsules();
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
  updateExplosionFx(Math.min(dt, 0.05));
  updateBlackHoleFx(Math.min(dt, 0.05));
  updateTornadoFx(Math.min(dt, 0.05));
  updatePortalFx(Math.min(dt, 0.05));
  updateCamera(dt);
  updateHighlight();

  if (state.skyTexture) {
    scene.backgroundRotation.y += dt * 0.004;
  }
  updateRemovedCounter();
  const afterUpdate = performance.now();

  renderer.render(scene, camera);
  const afterRender = performance.now();

  const perf = state.perf;
  perf.physics += (afterPhysics - frameStart - perf.physics) * 0.1;
  perf.update += (afterUpdate - afterPhysics - perf.update) * 0.1;
  perf.render += (afterRender - afterUpdate - perf.render) * 0.1;
  perf.total += (afterRender - frameStart - perf.total) * 0.1;
}
