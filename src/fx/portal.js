import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import { acquireEffect } from "./pool.js";
import { PORTAL_DURATION, PORTAL_RADIUS } from "../constants.js";

const PORTAL_BASE_COLOR = new THREE.Color(0x59c3ff);

export function initPortalFx() {
  const scene = engine.scene;
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

export function spawnPortal(x, z, tint) {
  const portal = acquireEffect(state.portals);

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

export function deactivatePortal(portal) {
  portal.active = false;
  portal.group.visible = false;
}

export function updatePortalFx(dt) {
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

export function resetPortalFx() {
  for (const portal of state.portals) {
    portal.active = false;
    portal.group.visible = false;
  }
}
