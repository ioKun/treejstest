import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import {
  CONFETTI_MAX,
  CONFETTI_PER_SHRED,
  CONFETTI_WIDTH,
  CONFETTI_HEIGHT,
  CONFETTI_LIFE_MIN,
  CONFETTI_LIFE_MAX,
  CONFETTI_SPEED_MIN,
  CONFETTI_SPEED_MAX,
  CONFETTI_UP_BIAS,
  CONFETTI_LATERAL_SPREAD,
  CONFETTI_FLIP_SPEED,
  CONFETTI_DRAG,
  CONFETTI_GRAVITY,
  CONFETTI_FADE_TAIL,
  CONFETTI_SCALE_MIN,
  CONFETTI_SCALE_MAX,
  CONFETTI_ORIGIN_Y,
} from "../constants.js";

const hsl = { h: 0, s: 0, l: 0 };
const parkedMatrix = new THREE.Matrix4().makeTranslation(0, -999, 0);

export function initConfettiFx() {
  const geometry = new THREE.PlaneGeometry(CONFETTI_WIDTH, CONFETTI_HEIGHT);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    roughness: 0.35,
    metalness: 0.08,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, CONFETTI_MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;

  for (let i = 0; i < CONFETTI_MAX; i++) mesh.setMatrixAt(i, parkedMatrix);

  engine.scene.add(mesh);

  state.fx.confetti = {
    mesh,
    position: new Float32Array(CONFETTI_MAX * 3),
    velocity: new Float32Array(CONFETTI_MAX * 3),
    spin: new Float32Array(CONFETTI_MAX * 3),
    euler: new Float32Array(CONFETTI_MAX * 3),
    scale: new Float32Array(CONFETTI_MAX),
    life: new Float32Array(CONFETTI_MAX),
    maxLife: new Float32Array(CONFETTI_MAX),
    active: new Uint8Array(CONFETTI_MAX),
    cursor: 0,
    color: new THREE.Color(),
    quat: new THREE.Quaternion(),
    eulerObj: new THREE.Euler(),
    posVec: new THREE.Vector3(),
    scaleVec: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
  };
}

export function burstShredConfetti(x, z, colorHex) {
  const confetti = state.fx?.confetti;
  if (!confetti) return;

  for (let n = 0; n < CONFETTI_PER_SHRED; n++) {
    const i = confetti.cursor++ % CONFETTI_MAX;

    const theta = Math.random() * Math.PI * 2;
    const up = CONFETTI_UP_BIAS + Math.random() * 0.26;
    const speed = CONFETTI_SPEED_MIN + Math.random() * (CONFETTI_SPEED_MAX - CONFETTI_SPEED_MIN);
    const lateral = speed * (1 - up) * CONFETTI_LATERAL_SPREAD;

    confetti.position[i * 3] = x + (Math.random() - 0.5) * 0.3;
    confetti.position[i * 3 + 1] = CONFETTI_ORIGIN_Y;
    confetti.position[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;

    confetti.velocity[i * 3] = Math.cos(theta) * lateral;
    confetti.velocity[i * 3 + 1] = up * speed;
    confetti.velocity[i * 3 + 2] = Math.sin(theta) * lateral;

    confetti.spin[i * 3] = (Math.random() * 2 - 1) * CONFETTI_FLIP_SPEED;
    confetti.spin[i * 3 + 1] = (Math.random() * 2 - 1) * CONFETTI_FLIP_SPEED * 0.4;
    confetti.spin[i * 3 + 2] = (Math.random() * 2 - 1) * CONFETTI_FLIP_SPEED;

    confetti.euler[i * 3] = Math.random() * Math.PI * 2;
    confetti.euler[i * 3 + 1] = Math.random() * Math.PI * 2;
    confetti.euler[i * 3 + 2] = Math.random() * Math.PI * 2;

    confetti.life[i] = CONFETTI_LIFE_MIN + Math.random() * (CONFETTI_LIFE_MAX - CONFETTI_LIFE_MIN);
    confetti.maxLife[i] = confetti.life[i];
    confetti.scale[i] = CONFETTI_SCALE_MIN + Math.random() * (CONFETTI_SCALE_MAX - CONFETTI_SCALE_MIN);
    confetti.active[i] = 1;

    confetti.color.setHex(colorHex);
    confetti.color.getHSL(hsl, THREE.SRGBColorSpace);
    confetti.color.setHSL(
      THREE.MathUtils.clamp(hsl.h + (Math.random() - 0.5) * 0.05, 0, 1),
      THREE.MathUtils.clamp(hsl.s * (0.88 + Math.random() * 0.3), 0, 1),
      THREE.MathUtils.clamp(hsl.l * (0.82 + Math.random() * 0.42), 0, 1)
    );
    confetti.mesh.setColorAt(i, confetti.color);
  }

  confetti.mesh.instanceColor.needsUpdate = true;
}

export function updateConfettiFx(dt) {
  const confetti = state.fx?.confetti;
  if (!confetti) return;

  const dragFactor = Math.exp(-CONFETTI_DRAG * dt);

  for (let i = 0; i < CONFETTI_MAX; i++) {
    if (!confetti.active[i]) continue;

    confetti.life[i] -= dt;

    if (confetti.life[i] <= 0) {
      confetti.active[i] = 0;
      confetti.mesh.setMatrixAt(i, parkedMatrix);
      continue;
    }

    confetti.velocity[i * 3] *= dragFactor;
    confetti.velocity[i * 3 + 1] = confetti.velocity[i * 3 + 1] * dragFactor - CONFETTI_GRAVITY * dt;
    confetti.velocity[i * 3 + 2] *= dragFactor;

    confetti.position[i * 3] += confetti.velocity[i * 3] * dt;
    confetti.position[i * 3 + 1] += confetti.velocity[i * 3 + 1] * dt;
    confetti.position[i * 3 + 2] += confetti.velocity[i * 3 + 2] * dt;

    confetti.euler[i * 3] += confetti.spin[i * 3] * dt;
    confetti.euler[i * 3 + 1] += confetti.spin[i * 3 + 1] * dt;
    confetti.euler[i * 3 + 2] += confetti.spin[i * 3 + 2] * dt;

    const fadeTail = confetti.maxLife[i] * CONFETTI_FADE_TAIL;
    const fade = Math.min(1, confetti.life[i] / fadeTail);
    const scale = confetti.scale[i] * fade;

    confetti.eulerObj.set(
      confetti.euler[i * 3],
      confetti.euler[i * 3 + 1],
      confetti.euler[i * 3 + 2]
    );
    confetti.quat.setFromEuler(confetti.eulerObj);
    confetti.posVec.set(
      confetti.position[i * 3],
      confetti.position[i * 3 + 1],
      confetti.position[i * 3 + 2]
    );
    confetti.scaleVec.setScalar(scale);
    confetti.matrix.compose(confetti.posVec, confetti.quat, confetti.scaleVec);
    confetti.mesh.setMatrixAt(i, confetti.matrix);
  }

  let highest = -1;
  for (let i = CONFETTI_MAX - 1; i >= 0; i--) {
    if (confetti.active[i]) {
      highest = i;
      break;
    }
  }
  confetti.mesh.count = highest + 1;
  confetti.mesh.instanceMatrix.needsUpdate = true;
}

export function resetConfettiFx() {
  const confetti = state.fx?.confetti;
  if (!confetti) return;

  confetti.active.fill(0);
  confetti.life.fill(0);
  confetti.cursor = 0;
  confetti.mesh.count = 0;

  for (let i = 0; i < CONFETTI_MAX; i++) confetti.mesh.setMatrixAt(i, parkedMatrix);

  confetti.mesh.instanceMatrix.needsUpdate = true;
}
