import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import { BLAST_RADIUS, MAX_SPARKS } from "../constants.js";

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

export function initExplosionFx() {
  const scene = engine.scene;
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

export function spawnExplosion(x, y, z) {
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

export function updateExplosionFx(dt) {
  const fx = state.fx;
  if (!fx) return;

  for (const effect of fx.shells) {
    if (!effect.active) continue;

    effect.age += dt;
    const t = Math.min(effect.age / effect.duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    effect.mesh.scale.setScalar(
      THREE.MathUtils.lerp(effect.startScale, effect.maxScale, eased)
    );
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

export function resetExplosionFx() {
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
