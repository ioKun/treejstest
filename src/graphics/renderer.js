import * as THREE from "three";
import { engine } from "../engine.js";
import { state, playerPos, cameraPoint } from "../state.js";
import { addSky, addLights, addGroundVisual } from "./environment.js";
import { initShredderVisual } from "./shredder.js";
import { addHighlightMesh } from "./highlight.js";
import { initExplosionFx } from "../fx/explosion.js";
import { initConfettiFx } from "../fx/confetti.js";
import { initBlackHoleFx } from "../fx/blackhole.js";
import { initPortalFx } from "../fx/portal.js";
import { initTornadoFx } from "../fx/tornado.js";

let resizeRegistered = false;

export function initRendererCore() {
  const canvas = document.getElementById("game");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0xd7e2e6, 1);
  engine.renderer = renderer;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd7e2e6, 0.014);
  engine.scene = scene;

  const camera = new THREE.PerspectiveCamera(
    58,
    window.innerWidth / window.innerHeight,
    0.1,
    260
  );
  engine.camera = camera;

  if (!resizeRegistered) {
    window.addEventListener("resize", onResize);
    resizeRegistered = true;
  }
}

export function initGraphics() {
  initRendererCore();

  addSky();
  addLights();
  addGroundVisual();
  initShredderVisual();
  addHighlightMesh();
  initExplosionFx();
  initConfettiFx();
  initBlackHoleFx();
  initPortalFx();
  initTornadoFx();
}

export function onResize() {
  engine.camera.aspect = window.innerWidth / window.innerHeight;
  engine.camera.updateProjectionMatrix();
  engine.renderer.setSize(window.innerWidth, window.innerHeight);
}

export function updateCamera() {
  const camera = engine.camera;
  const target = cameraPoint;
  target.copy(playerPos);
  target.y += 0.55;

  const cosPitch = Math.cos(state.pitch);
  const x = target.x + Math.sin(state.yaw) * cosPitch * state.distance;
  const y = target.y + Math.sin(state.pitch) * state.distance;
  const z = target.z + Math.cos(state.yaw) * cosPitch * state.distance;

  camera.position.set(x, Math.max(0.32, y), z);
  camera.lookAt(target);
}
