import * as THREE from "three";
import { engine } from "../engine.js";
import {
  LAKE_TREE_COUNT,
  LAKE_FLOWER_COUNT,
  LAKE_GRASS_COUNT,
} from "../constants.js";
import { lakeHeight } from "../scenes/lake/terrainMath.js";
import {
  makeBarkTexture,
  makeFoliageTexture,
} from "./lakeTextures.js";

const windUniform = { value: 0 };

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const R_ = (a, b) => a + Math.random() * (b - a);

const hash = (x, y, z) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

function lump(g, amt, cone) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (hash(x, y, z) - 0.5) * amt;
    p.setXYZ(
      i,
      x * k,
      y + (hash(z, x, y) - 0.5) * amt * (cone ? 0.6 : 0.5),
      z * k
    );
  }
  g.computeVertexNormals();
  return g;
}

function sway(mat, amount) {
  mat.onBeforeCompile = (shader) => {
    if (shader.uniforms) shader.uniforms.uT = windUniform;
    if (shader.vertexShader.includes("#include <common>")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uT;"
      );
    } else if (!shader.vertexShader.includes("uniform float uT;")) {
      shader.vertexShader = "uniform float uT;\n" + shader.vertexShader;
    }
    const begin = "#include <begin_vertex>";
    if (shader.vertexShader.includes(begin)) {
      shader.vertexShader = shader.vertexShader.replace(
        begin,
        begin +
          "\n#ifdef USE_INSTANCING\nfloat ph=instanceMatrix[3].x*.3+instanceMatrix[3].z*.27;\n#else\nfloat ph=0.;\n#endif\nfloat hh=max(position.y,0.);\ntransformed.x+=sin(uT*1.3+ph+hh*.3)*pow(hh,1.5)*" +
          amount +
          ";\ntransformed.z+=cos(uT*1.0+ph*1.3)*pow(hh,1.5)*" +
          amount +
          ";"
      );
    }
  };
  mat.userData = mat.userData || {};
  mat.userData.windUniform = windUniform;
  mat.uniforms = { uT: windUniform };
}

export function initLakeFlora() {
  const bark = makeBarkTexture();
  const barkMat = new THREE.MeshLambertMaterial({ map: bark });
  const barkMat2 = new THREE.MeshLambertMaterial({ map: bark, color: 0xe6e0d2 });

  const spruceFoliageTex = makeFoliageTexture(4, 2);
  const spruceFoliageMat = new THREE.MeshLambertMaterial({
    map: spruceFoliageTex,
    side: THREE.DoubleSide,
  });
  sway(spruceFoliageMat, ".006");

  const broadFoliageTex = makeFoliageTexture(3, 2);
  const broadFoliageMat = new THREE.MeshLambertMaterial({ map: broadFoliageTex });
  sway(broadFoliageMat, ".004");

  const dm = new THREE.Object3D();
  const color = new THREE.Color();

  const spruceTrunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.38, 2.6, 7).translate(0, 1.3, 0),
    barkMat,
    LAKE_TREE_COUNT
  );
  const spruceCones = [
    [2.3, 2.8, 2.4, 0.35],
    [1.8, 2.6, 3.9, 0.35],
    [1.2, 2.4, 5.3, 0.3],
  ].map(([r, h, y, a]) =>
    new THREE.InstancedMesh(
      lump(new THREE.ConeGeometry(r, h, 10, 3, true), a, 1).translate(0, y, 0),
      spruceFoliageMat,
      LAKE_TREE_COUNT
    )
  );

  const broadTrunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.26, 3.2, 7).translate(0, 1.6, 0),
    barkMat2,
    LAKE_TREE_COUNT
  );
  const broadLeaves = [
    [0, 3.6, 0, 1.9],
    [0.9, 4.5, 0.3, 1.4],
    [-0.8, 4.2, -0.6, 1.5],
  ].map(([x, y, z, r]) =>
    new THREE.InstancedMesh(
      lump(new THREE.SphereGeometry(r, 12, 9), 0.4, 0).translate(x, y, z),
      broadFoliageMat,
      LAKE_TREE_COUNT
    )
  );

  let ti = 0;
  let bi = 0;
  for (let tries = 0; tries < 6000 && ti + bi < LAKE_TREE_COUNT; tries++) {
    const x = (Math.random() - 0.5) * 190;
    const z = (Math.random() - 0.5) * 190;
    const d = Math.hypot(x, z);
    const h = lakeHeight(x, z);
    if (d < 34 || h < 0.3 || h > 9 || Math.random() > smoothstep(36, 75, d) + 0.04) continue;
    const broad = Math.random() < 0.22 && d < 72;
    if (broad) {
      if (bi >= LAKE_TREE_COUNT) continue;
    } else {
      if (ti >= LAKE_TREE_COUNT) continue;
    }
    const s = 0.8 + Math.random() * 1.0;
    dm.position.set(x, h - 0.2, z);
    dm.rotation.set(0, Math.random() * 6.28, 0);
    dm.scale.set(s, s * (0.9 + Math.random() * 0.4), s);
    dm.updateMatrix();
    if (broad) {
      broadTrunk.setMatrixAt(bi, dm.matrix);
      color.setHSL(
        Math.random() < 0.15 ? 0.09 : 0.18 + Math.random() * 0.1,
        0.55,
        0.38 + Math.random() * 0.12
      );
      broadLeaves.forEach((m) => {
        m.setMatrixAt(bi, dm.matrix);
        m.setColorAt(bi, color);
      });
      bi++;
    } else {
      spruceTrunk.setMatrixAt(ti, dm.matrix);
      color.setHSL(0.27 + Math.random() * 0.08, 0.5, 0.3 + Math.random() * 0.1);
      spruceCones.forEach((m) => {
        m.setMatrixAt(ti, dm.matrix);
        m.setColorAt(ti, color);
      });
      ti++;
    }
  }

  spruceTrunk.count = ti;
  spruceCones.forEach((m) => (m.count = ti));
  broadTrunk.count = bi;
  broadLeaves.forEach((m) => (m.count = bi));

  spruceTrunk.castShadow = true;
  spruceCones.forEach((m) => (m.castShadow = true));
  broadTrunk.castShadow = true;
  broadLeaves.forEach((m) => (m.castShadow = true));

  const flowerMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const flowerMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.12, 0),
    flowerMat,
    LAKE_FLOWER_COUNT
  );
  const flowerPalette = [0xffffff, 0xffe14d, 0xff7aa8, 0xb48cff];
  let fi = 0;
  for (let tries = 0; tries < 4000 && fi < LAKE_FLOWER_COUNT; tries++) {
    const x = (Math.random() - 0.5) * 130;
    const z = (Math.random() - 0.5) * 130;
    const d = Math.hypot(x, z);
    const h = lakeHeight(x, z);
    if (d < 28 || d > 58 || h < 0.45) continue;
    dm.position.set(x, h + 0.15, z);
    dm.rotation.set(0, 0, 0);
    dm.scale.setScalar(0.7 + Math.random() * 0.8);
    dm.updateMatrix();
    flowerMesh.setMatrixAt(fi, dm.matrix);
    flowerMesh.setColorAt(fi, color.setHex(flowerPalette[fi % 4]));
    fi++;
  }
  flowerMesh.count = fi;

  const grassVerts = [];
  const grassCols = [];
  const grassIdx = [];
  [[0, 0.055], [0.35, 0.045], [0.7, 0.027]].forEach(([y, w]) => {
    grassVerts.push(-w, y, 0, w, y, 0);
    const r = 0.04 + 0.5 * y;
    const g = 0.12 + 0.7 * y;
    const b = 0.03 + 0.25 * y;
    grassCols.push(r, g, b, r, g, b);
  });
  grassVerts.push(0, 1, 0);
  grassCols.push(0.55, 0.8, 0.3);
  grassIdx.push(0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6);

  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute("position", new THREE.Float32BufferAttribute(grassVerts, 3));
  grassGeo.setAttribute("color", new THREE.Float32BufferAttribute(grassCols, 3));
  grassGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      new Array(21).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3
    )
  );
  grassGeo.setIndex(grassIdx);

  const grassMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  sway(grassMat, ".22");

  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, LAKE_GRASS_COUNT);
  let gi = 0;
  for (let tries = 0; tries < 120000 && gi < LAKE_GRASS_COUNT; tries++) {
    const cx = (Math.random() - 0.5) * 124;
    const cz = (Math.random() - 0.5) * 124;
    const d = Math.hypot(cx, cz);
    if (d > 62 || d < 26 || Math.random() < smoothstep(40, 62, d) * 0.7) continue;
    for (let k = 0; k < 6 && gi < LAKE_GRASS_COUNT; k++) {
      const x = cx + R_(-0.4, 0.4);
      const z = cz + R_(-0.4, 0.4);
      const h = lakeHeight(x, z);
      if (h < 0.25 || h > 6) continue;
      const s = R_(0.8, 1.4);
      dm.position.set(x, h - 0.02, z);
      dm.rotation.set(R_(-0.25, 0.25), Math.random() * 6.28, 0);
      dm.scale.set(s, R_(0.45, 1.2), s);
      dm.updateMatrix();
      grassMesh.setMatrixAt(gi, dm.matrix);
      grassMesh.setColorAt(gi, color.setHSL(0.22 + Math.random() * 0.1, 0.5, 0.55 + Math.random() * 0.35));
      gi++;
    }
  }
  grassMesh.count = gi;
  grassMesh.castShadow = false;

  const meshes = [
    spruceTrunk,
    ...spruceCones,
    broadTrunk,
    ...broadLeaves,
    flowerMesh,
    grassMesh,
  ];

  meshes.forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.userData = m.userData || {};
    m.userData.windUniform = windUniform;
    engine.scene.add(m);
  });
}

export function updateLakeFlora(dt) {
  windUniform.value += dt;
}

export { windUniform };
export const uT = windUniform;
export const uTUniform = windUniform;