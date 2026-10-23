import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { engine } from "../engine.js";
import {
  PIT_CENTER_X,
  PIT_CENTER_Z,
  PIT_HALF_X,
  PIT_HALF_Z,
  PIT_WALL_THICKNESS,
  PIT_DEPTH,
  SHREDDER_SHAFT_AXIS_Y,
  SHREDDER_SHAFT_OFFSET_Z,
  SHREDDER_DISC_RADIUS,
  SHREDDER_DISC_PITCH,
  SHREDDER_DISC_COUNT,
  SHREDDER_OMEGA,
} from "../constants.js";

const STEEL_DARK = 0x23272e;
const STEEL_TOOTH = 0x4c545e;
const WARNING_STRIPE = 0xc7a23c;
const PIT_WALL_COLOR = 0x14171b;
const PIT_FLOOR_COLOR = 0x1a1d21;

const shaftGroups = [];

function addBox(cx, y, cz, sx, sy, sz, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(cx, y, cz);
  engine.scene.add(mesh);
  return mesh;
}

export function initShredderVisual() {
  const scene = engine.scene;

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: PIT_WALL_COLOR,
    roughness: 0.9,
    metalness: 0.06,
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: PIT_FLOOR_COLOR,
    roughness: 0.95,
    metalness: 0.05,
  });

  wallMaterial.polygonOffset = true;
  wallMaterial.polygonOffsetFactor = 1;
  wallMaterial.polygonOffsetUnits = 1;

  const wallX = PIT_HALF_X + PIT_WALL_THICKNESS / 2;
  const wallZ = PIT_HALF_Z + PIT_WALL_THICKNESS / 2;
  const wallY = -PIT_DEPTH / 2;

  addBox(
    PIT_CENTER_X,
    wallY,
    PIT_CENTER_Z - wallZ,
    wallX + PIT_WALL_THICKNESS,
    PIT_DEPTH,
    PIT_WALL_THICKNESS / 2,
    wallMaterial
  );
  addBox(
    PIT_CENTER_X,
    wallY,
    PIT_CENTER_Z + wallZ,
    wallX + PIT_WALL_THICKNESS,
    PIT_DEPTH,
    PIT_WALL_THICKNESS / 2,
    wallMaterial
  );
  addBox(
    PIT_CENTER_X - wallX,
    wallY,
    PIT_CENTER_Z,
    PIT_WALL_THICKNESS / 2,
    PIT_DEPTH,
    PIT_HALF_Z,
    wallMaterial
  );
  addBox(
    PIT_CENTER_X + wallX,
    wallY,
    PIT_CENTER_Z,
    PIT_WALL_THICKNESS / 2,
    PIT_DEPTH,
    PIT_HALF_Z,
    wallMaterial
  );
  addBox(
    PIT_CENTER_X,
    -PIT_DEPTH - 0.1,
    PIT_CENTER_Z,
    wallX,
    0.2,
    wallZ,
    floorMaterial
  );

  const stripeMaterial = new THREE.MeshStandardMaterial({
    color: WARNING_STRIPE,
    roughness: 0.6,
    metalness: 0.15,
  });
  const stripeLength = 2 * (PIT_HALF_X + PIT_WALL_THICKNESS) + 0.4;
  const stripeOffset = PIT_HALF_Z + PIT_WALL_THICKNESS + 0.16;

  addBox(
    PIT_CENTER_X,
    0.015,
    PIT_CENTER_Z + stripeOffset,
    stripeLength,
    0.03,
    0.2,
    stripeMaterial
  );
  addBox(
    PIT_CENTER_X,
    0.015,
    PIT_CENTER_Z - stripeOffset,
    stripeLength,
    0.03,
    0.2,
    stripeMaterial
  );

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: STEEL_DARK,
    roughness: 0.45,
    metalness: 0.7,
  });
  const toothMaterial = new THREE.MeshStandardMaterial({
    color: STEEL_TOOTH,
    roughness: 0.4,
    metalness: 0.75,
  });

  const sideLength = 2 * PIT_HALF_X + 0.7;
  for (const side of [-1, 1]) {
    addBox(
      PIT_CENTER_X,
      SHREDDER_SHAFT_AXIS_Y,
      PIT_CENTER_Z + side * (SHREDDER_SHAFT_OFFSET_Z + 0.55),
      sideLength,
      0.5,
      0.18,
      frameMaterial
    );
  }

  const coreGeometry = new THREE.CylinderGeometry(0.14, 0.14, 2.9, 16);
  coreGeometry.rotateZ(-Math.PI / 2);

  const discGeometry = makeToothDiscGeometry();
  const discMesh = new THREE.Mesh(discGeometry, toothMaterial);
  discMesh.castShadow = true;

  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    group.position.set(
      PIT_CENTER_X,
      SHREDDER_SHAFT_AXIS_Y,
      PIT_CENTER_Z + side * SHREDDER_SHAFT_OFFSET_Z
    );

    for (let i = 0; i < SHREDDER_DISC_COUNT; i++) {
      const disc = discMesh.clone();
      disc.position.set(
        (i - (SHREDDER_DISC_COUNT - 1) / 2) * SHREDDER_DISC_PITCH,
        0,
        0
      );
      group.add(disc);
    }

    const core = new THREE.Mesh(coreGeometry, frameMaterial);
    group.add(core);

    scene.add(group);
    shaftGroups.push({
      group,
      omega: side > 0 ? -SHREDDER_OMEGA : SHREDDER_OMEGA,
    });
  }
}

function makeToothDiscGeometry() {
  const teeth = 6;
  const parts = [
    new THREE.CylinderGeometry(
      SHREDDER_DISC_RADIUS,
      SHREDDER_DISC_RADIUS,
      0.14,
      20
    ),
  ];

  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(0.12, 0.16, 0.26);
    tooth.rotateY(-angle);
    tooth.translate(
      Math.cos(angle) * (SHREDDER_DISC_RADIUS + 0.05),
      0,
      Math.sin(angle) * (SHREDDER_DISC_RADIUS + 0.05)
    );
    parts.push(tooth);
  }

  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  geometry.rotateZ(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export function updateShredderVisual(dt) {
  for (const shaft of shaftGroups) {
    shaft.group.rotation.x += shaft.omega * dt;
  }
}
