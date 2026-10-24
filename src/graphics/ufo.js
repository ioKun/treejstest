// TODO: refine tube visuals and proportions (placeholder geometry).
import * as THREE from "three";
import { state } from "../state.js";
import { UFO_VISUAL_Y, PILE_CENTER_Z, UFO_TUBE_RADIUS, UFO_TUBE_HEIGHT } from "../constants.js";

let ufo = null;
let bobTime = 0;

export function buildUfoVisual() {
  const group = new THREE.Group();

  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(UFO_TUBE_RADIUS, UFO_TUBE_RADIUS, UFO_TUBE_HEIGHT, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x5a6b7c,
      metalness: 0.85,
      roughness: 0.35,
      side: THREE.DoubleSide,
    })
  );
  tube.castShadow = false;
  group.add(tube);

  const rimTop = new THREE.Mesh(
    new THREE.TorusGeometry(UFO_TUBE_RADIUS, 0.08, 12, 24),
    new THREE.MeshStandardMaterial({ color: 0x8fa3b8, metalness: 0.9, roughness: 0.2 })
  );
  rimTop.rotation.x = Math.PI / 2;
  rimTop.position.y = UFO_TUBE_HEIGHT / 2;
  group.add(rimTop);

  const rimBottom = rimTop.clone();
  rimBottom.position.y = -UFO_TUBE_HEIGHT / 2;
  group.add(rimBottom);

  const glow = new THREE.PointLight(0x66ccff, 1.2, 14);
  glow.position.y = -UFO_TUBE_HEIGHT / 2;
  group.add(glow);

  group.position.set(0, UFO_VISUAL_Y, PILE_CENTER_Z);
  group.visible = false;
  return group;
}

export function initUfoVisual(scene) {
  ufo = buildUfoVisual();
  scene.add(ufo);
}

export function updateUfoVisual(dt) {
  if (!ufo) return;
  const show = state.ufoActive || state.spawnMode === "ufo";
  ufo.visible = show;
  if (!show) return;
  bobTime += dt;
  ufo.position.x = Math.sin(bobTime * 0.4) * 0.4;
  ufo.position.z = PILE_CENTER_Z + Math.cos(bobTime * 0.35) * 0.4;
  ufo.position.y = UFO_VISUAL_Y + Math.sin(bobTime * 1.1) * 0.25;
  ufo.rotation.y += dt * 0.25;
}
