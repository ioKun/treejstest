import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";

export function addHighlightMesh() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0x5ee2ff,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 5;
  engine.scene.add(mesh);
  state.highlightMesh = mesh;
}

export function setHighlighted(object) {
  state.highlighted = object;

  const mesh = state.highlightMesh;
  if (!object) {
    mesh.visible = false;
    return;
  }

  mesh.visible = true;
  mesh.position.copy(object.position);
  mesh.quaternion.copy(object.quaternion);
  mesh.scale.set(
    object.bounds.x + 0.06,
    object.bounds.y + 0.06,
    object.bounds.z + 0.06
  );
}
