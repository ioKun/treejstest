import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import { acquireEffect } from "./pool.js";
import {
  BLACKHOLE_DURATION,
  BLACKHOLE_RADIUS,
} from "../constants.js";

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

export function initBlackHoleFx() {
  const scene = engine.scene;
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

export function spawnBlackHole(x, y, z) {
  const hole = acquireEffect(state.blackHoles);

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

export function deactivateBlackHole(hole) {
  hole.active = false;
  hole.group.visible = false;
}

export function updateBlackHoleFx(dt) {
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

export function resetBlackHoleFx() {
  for (const hole of state.blackHoles) {
    hole.active = false;
    hole.group.visible = false;
  }
}
