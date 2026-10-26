import * as THREE from "three";
import { engine } from "../engine.js";
import { state } from "../state.js";
import {
  LAKE_SIZE,
  LAKE_FOG_DENSITY,
  LAKE_TERRAIN_VISUAL_SEGMENTS,
  LAKE_SKY_RADIUS,
  LAKE_CAMERA_FAR,
} from "../constants.js";
import { lakeHeight } from "../scenes/lake/terrainMath.js";
import { makeGrassTexture } from "./lakeTextures.js";

let skyDome = null;

export function initLakeEnvironment() {
  engine.scene.fog = new THREE.FogExp2(0xbfd9ef, LAKE_FOG_DENSITY);

  const SUN = new THREE.Vector3(0.6, 0.5, 0.35).normalize();

  const skyGLSL = "vec3 sky(vec3 d){float t=clamp(d.y,0.,1.);vec3 c=mix(vec3(.75,.85,.95),vec3(.18,.42,.82),pow(t,.5));float s=max(dot(d,uSun),0.);c+=vec3(1.,.85,.6)*(pow(s,600.)*3.+pow(s,8.)*.25);return c;}";

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uSun: { value: SUN } },
    vertexShader: "varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "uniform vec3 uSun; varying vec3 vD; " + skyGLSL + " void main(){ gl_FragColor=vec4(sky(normalize(vD)),1.); }",
  });

  skyDome = new THREE.Mesh(new THREE.SphereGeometry(LAKE_SKY_RADIUS, 24, 12), skyMat);
  skyDome.renderOrder = -1;
  engine.scene.add(skyDome);

  const hemisphere = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a30, 0.85);
  engine.scene.add(hemisphere);

  const dirLight = new THREE.DirectionalLight(0xfff0d0, 0.9);
  dirLight.position.copy(SUN).multiplyScalar(100);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -60;
  dirLight.shadow.camera.right = 60;
  dirLight.shadow.camera.top = 60;
  dirLight.shadow.camera.bottom = -60;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 300;
  dirLight.shadow.bias = -0.0004;
  dirLight.shadow.normalBias = 0.02;
  engine.scene.add(dirLight);

  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  const terrainGeo = new THREE.PlaneGeometry(
    LAKE_SIZE,
    LAKE_SIZE,
    LAKE_TERRAIN_VISUAL_SEGMENTS,
    LAKE_TERRAIN_VISUAL_SEGMENTS
  );
  terrainGeo.rotateX(-Math.PI / 2);

  const pos = terrainGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, lakeHeight(x, z));
    const h = pos.getY(i);
    const n = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.5 + 0.5;
    if (h < -0.1) c.setRGB(0.30, 0.26, 0.18);
    else if (h < 0.7) c.setRGB(0.78, 0.70, 0.50).lerp(new THREE.Color(0.40, 0.55, 0.22), sm(0.1, 0.7, h));
    else c.setRGB(0.30 + 0.1 * n, 0.52 + 0.12 * n, 0.2).lerp(new THREE.Color(0.14, 0.32, 0.12), sm(3, 9, h));
    colors.set([c.r, c.g, c.b], i * 3);
  }

  terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true, map: makeGrassTexture() })
  );
  terrainMesh.receiveShadow = true;
  engine.scene.add(terrainMesh);

  engine.camera.far = LAKE_CAMERA_FAR;
  engine.camera.updateProjectionMatrix();

  state.skyTexture = null;
}

export function updateLakeEnvironment(dt) {
  if (skyDome) skyDome.position.copy(engine.camera.position);
}
