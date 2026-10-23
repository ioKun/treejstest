import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import { acquireEffect } from "./pool.js";
import {
  TORNADO_DURATION,
  TORNADO_HEIGHT,
  TORNADO_PARTICLES,
  TORNADO_RADIUS,
  TORNADO_SPEED,
} from "../constants.js";

const TORNADO_BASE_COLOR = new THREE.Color(0xb9c9d6);

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

export function initTornadoFx() {
  const scene = engine.scene;
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

export function spawnTornado(x, z, dirX, dirZ, tint) {
  const tornado = acquireEffect(state.tornadoes);

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
  tornado.dustMaterial.color
    .copy(tornado.tint)
    .lerp(TORNADO_BASE_COLOR, 0.25);
  tornado.dustMaterial.opacity = 0;
  tornado.ringMaterial.color.copy(tornado.tint);
  tornado.ringMaterial.opacity = 0;
  tornado.ring.scale.setScalar(1);
  resetTornadoParticles(tornado);
}

export function deactivateTornado(tornado) {
  tornado.active = false;
  tornado.group.visible = false;
  tornado.funnelMaterial.uniforms.uAlpha.value = 0;
  tornado.dustMaterial.opacity = 0;
  tornado.ringMaterial.opacity = 0;
}

export function updateTornadoFx(dt) {
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

export function resetTornadoFx() {
  for (const tornado of state.tornadoes) {
    deactivateTornado(tornado);
  }
}
