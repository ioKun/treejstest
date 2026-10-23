import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as THREE from "three";

const SOFT_COLORS = [
  0xff8a5b, 0xffc857, 0x5dd6a8, 0x59c3ff, 0xb08cff, 0xff6f91, 0x8ee36b,
  0x4fb3bf, 0xf2a65a, 0x7d9bff, 0xe76fe0, 0x8bd450, 0xffb4a2, 0x5fa8ff,
];
const METAL_COLORS = [
  0x8d99a6, 0xb87333, 0xc9a227, 0x6f7a85, 0x9aa7b1, 0x7c5c3e,
];
const PIPE_COLORS = [0x4fb3bf, 0x8d99a6, 0xb87333, 0x5f7f8f, 0xa44a3f, 0x6f7a85];
const FRAME_COLORS = [0x59c3ff, 0x8d99a6, 0xff8a5b, 0x5dd6a8, 0xb08cff, 0x7d9bff];

export const OBJECT_NAMES = {
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
    new THREE.BoxGeometry(thickness, 1 - thickness * 2, 1).translate(
      -0.5 + thickness / 2,
      0,
      0
    ),
    new THREE.BoxGeometry(thickness, 1 - thickness * 2, 1).translate(
      0.5 - thickness / 2,
      0,
      0
    ),
  ];
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

export const TYPE_CONFIG = {
  box: {
    count: 220,
    geometry: () => new THREE.BoxGeometry(1, 1, 1),
    material: () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0.08,
      }),
    palette: SOFT_COLORS,
  },
  sphere: {
    count: 160,
    geometry: () => new THREE.SphereGeometry(1, 18, 12),
    material: () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.38,
        metalness: 0.1,
      }),
    palette: SOFT_COLORS,
  },
  capsule: {
    count: 140,
    geometry: () => new THREE.CapsuleGeometry(0.5, 1, 4, 10),
    material: () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.38,
        metalness: 0.1,
      }),
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
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0.4,
      }),
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
