import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import { TYPE_CONFIG } from "../graphics/objectAssets.js";

export function createTypeMesh(type, count) {
  const config = TYPE_CONFIG[type];
  const geometry = config.geometry();
  const material = config.material();
  const mesh = new THREE.InstancedMesh(geometry, material, count);

  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = type;

  engine.scene.add(mesh);
  state.instances[type] = mesh;
  return mesh;
}

export function finalizeTypeMesh(mesh) {
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
}
