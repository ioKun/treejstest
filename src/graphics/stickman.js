import * as THREE from "three";
import { engine } from "../engine.js";
import { state, playerVel } from "../state.js";
import { PLAYER_SPAWN_Y, RUN_SPEED } from "../constants.js";

export function createStickmanVisual() {
  const root = new THREE.Group();
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

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.085, 0.48, 6, 12),
    skin
  );
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

  return { root, limbs: { leftArm, rightArm, leftLeg, rightLeg } };
}

export function buildStickman() {
  const visual = createStickmanVisual();
  const root = visual.root;
  root.position.set(0, PLAYER_SPAWN_Y, 0);
  engine.scene.add(root);
  state.playerRoot = root;
  state.limbs = visual.limbs;
}

function makeLimb(parent, x, y, z, length, radius, material) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);

  const geometry = new THREE.CapsuleGeometry(
    radius,
    Math.max(0.02, length - radius * 2),
    4,
    8
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;

  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

export function animateLimbs(dt) {
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
