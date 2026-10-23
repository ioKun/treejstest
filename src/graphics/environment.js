import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import { GROUND_HALF_SIZE } from "../constants.js";

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

export function addSky() {
  const texture = makeSkyTexture();
  texture.mapping = THREE.EquirectangularReflectionMapping;
  engine.scene.background = texture;
  state.skyTexture = texture;
}

export function addLights() {
  const scene = engine.scene;
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

export function addGroundVisual() {
  const texture = makeAsphaltTexture();
  texture.anisotropy = engine.renderer.capabilities.getMaxAnisotropy();

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
  engine.scene.add(ground);
}
