import * as THREE from "three";
import { ROBOT_SCALE, ROBOT_ROOT_OFFSET_Y } from "../constants.js";

export function createRobotModel() {
  const root = new THREE.Group();
  const model = new THREE.Group();

  const std = (c, r = 0.6, m = 0, flat = false) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, flatShading: flat });

  const M = {
    beige: std(0xc9b88f, 0.55),
    olive: std(0x6a6a2c, 0.7),
    ochre: std(0xd09a3a, 0.5),
    metal: std(0x2c2b28, 0.4, 0.7),
    screen: std(0x050505, 0.15),
    moss1: std(0x4c6a1e, 0.95, 0, true),
    moss2: std(0x6e8a30, 0.95, 0, true),
    leaf: std(0x82a63a, 0.6),
    wood: std(0x5a4128, 0.8),
    glow: new THREE.MeshBasicMaterial({ color: 0x60fff4 }),
  };

  const V3 = THREE.Vector3;
  const bn = {};
  let CUR;

  function mk(name, parent, pv) {
    const b = new THREE.Bone();
    b.name = name;
    b.userData.pivot = new V3(...pv);
    b.position.copy(b.userData.pivot).sub(parent.userData.pivot);
    parent.add(b);
    bn[name] = b;
    return b;
  }

  model.userData.pivot = new V3();

  bn.hips = mk("hips", model, [0, 0, 1]);
  bn.torso = CUR = mk("torso", bn.hips, [0, 0, 1]);
  bn.ant = mk("ant", bn.torso, [0, 0.05, 2.9]);

  function add(geo, mat, loc, rot, scl, bone) {
    const b = bone || CUR;
    const m = new THREE.Mesh(geo, M[mat]);
    m.rotation.order = "ZYX";
    m.position.set(...loc).sub(b.userData.pivot);
    if (rot) m.rotation.set(...rot);
    if (scl) m.scale.set(...scl);
    m.castShadow = true;
    b.add(m);
    return m;
  }

  const sph = (loc, s, mat, rot, b) =>
    add(new THREE.SphereGeometry(1, 40, 24), mat, loc, rot, s, b);
  const cyl = (loc, r, d, mat, rot, b) =>
    add(new THREE.CylinderGeometry(r, r, d, 28).rotateX(Math.PI / 2), mat, loc, rot, null, b);
  const tor = (loc, R, r, mat, rot, b) =>
    add(new THREE.TorusGeometry(R, r, 16, 48), mat, loc, rot, null, b);
  const cone = (loc, r1, r2, d, mat, rot, b) => {
    const m = add(new THREE.CylinderGeometry(r2, r1, d, 6).rotateX(Math.PI / 2), mat, loc, rot, null, b);
    m.material = m.material.clone();
    m.material.flatShading = true;
    return m;
  };

  function rbox(w, h, d, r) {
    r = Math.min(r, w / 2.2, h / 2.2, d / 2.2);
    const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const hx = w / 2 - r;
    const hy = h / 2 - r;
    const hz = d / 2 - r;
    const v = new THREE.Vector3();
    const inner = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      inner.set(
        Math.max(-hx, Math.min(hx, v.x)),
        Math.max(-hy, Math.min(hy, v.y)),
        Math.max(-hz, Math.min(hz, v.z))
      );
      v.sub(inner);
      if (v.lengthSq() > 1e-9) {
        v.normalize();
        n.setXYZ(i, v.x, v.y, v.z);
        v.multiplyScalar(r);
      }
      p.setXYZ(i, inner.x + v.x, inner.y + v.y, inner.z + v.z);
    }
    return g;
  }

  const box = (loc, s, mat, rot, b) => add(rbox(s[0], s[1], s[2], 0.05), mat, loc, rot, null, b);

  const BZ = 1.95;
  const RX = Math.PI / 2;
  const RY = Math.PI / 2;
  const rad = Math.PI / 180;

  sph([0, 0, BZ], [1, 0.95, 0.97], "beige");
  sph([0, 0.02, BZ - 0.62], [0.8, 0.78, 0.4], "olive");
  box([0, 0, BZ - 1.0], [0.8, 0.55, 0.3], "metal");
  box([0, 0, BZ + 0.93], [0.55, 0.3, 0.1], "ochre", [0, -4 * rad, 0]);

  const fy = -0.95 * 0.9;
  const cz = BZ + 0.02;
  tor([0, fy, cz], 0.46, 0.09, "metal", [RX, 0, 0]);
  cyl([0, fy + 0.03, cz], 0.46, 0.1, "screen", [RX, 0, 0]);
  const eyes = [-1, 1].map((sx) => sph([sx * 0.17, fy - 0.045, cz], [0.075, 0.03, 0.095], "glow"));
  eyes.forEach((e) => (e.castShadow = false));

  CUR = bn.ant;
  const top = BZ + 0.95;
  cyl([0, 0.05, top + 0.3], 0.022, 0.6, "wood");
  sph([0, 0.05, top + 0.66], [0.045, 0.045, 0.075], "wood");
  cyl([0.1, 0.05, top + 0.42], 0.014, 0.26, "wood", [0, -60 * rad, 0]);
  sph([0.3, 0.05, top + 0.52], [0.17, 0.05, 0.025], "leaf", [0, -20 * rad, 0]);

  CUR = bn.torso;
  for (const sx of [-1, 1]) {
    const S = sx < 0 ? "L" : "R";
    const x = sx * 0.42;
    const hb = mk("hip" + S, bn.hips, [x, 0, 1]);
    const ab = mk("ankle" + S, hb, [x, 0, 0.48]);
    cyl([x, 0, 1.0], 0.2, 0.34, "metal", [0, RY, 0], hb);
    cyl([x, 0, 0.66], 0.14, 0.3, "metal", null, hb);
    cyl([x, 0, 0.48], 0.17, 0.26, "metal", [0, RY, 0], ab);
    box([x, -0.06, 0.2], [0.38, 0.56, 0.26], "ochre", [-6 * rad, 0, 0], ab);
    box([x, 0.02, 0.36], [0.3, 0.34, 0.14], "olive", null, ab);

    const sb = mk("shoulder" + S, bn.torso, [sx * 1.05, 0.02, BZ + 0.02]);
    const eb = mk("elbow" + S, sb, [sx * 1.18, 0, 1.1]);
    tor([sx * 0.93, 0.02, BZ + 0.02], 0.32, 0.07, "metal", [0, RY, 0], sb);
    cone([sx * 1.08, 0.02, BZ + 0.02], 0.26, 0.26, 0.28, "ochre", [0, RY, 0], sb);
    cyl([sx * 1.1, 0.02, BZ - 0.22], 0.13, 0.3, "olive", null, sb);
    box([sx * 1.18, 0, 1.45], [0.36, 0.36, 0.55], "beige", null, sb);
    box([sx * 1.18, 0, 1.2], [0.4, 0.4, 0.1], "olive", null, sb);
    cyl([sx * 1.18, 0, 1.1], 0.15, 0.22, "metal", null, eb);
    box([sx * 1.2, -0.02, 0.88], [0.38, 0.38, 0.5], "beige", null, eb);
    const hx = sx * 1.2;
    const hz = 0.52;
    box([hx, -0.02, hz], [0.28, 0.2, 0.2], "metal", null, eb);
    [-0.09, 0, 0.09].forEach((fx) => {
      box([hx + fx, -0.1, hz - 0.17], [0.07, 0.07, 0.22], "metal", [-15 * rad, 0, 0], eb);
      box([hx + fx, -0.15, hz - 0.33], [0.065, 0.065, 0.14], "ochre", [-35 * rad, 0, 0], eb);
    });
    box([hx - sx * 0.17, -0.06, hz - 0.04], [0.08, 0.08, 0.2], "metal", [0, sx * 25 * rad, sx * -20 * rad], eb);
    const an = new THREE.Object3D();
    an.position.set(hx - sx * 0.14, -0.1, 0.4).sub(eb.userData.pivot);
    eb.add(an);
  }

  CUR = bn.torso;

  let seed = 7;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = () => (rnd() < 0.5 ? "moss1" : "moss2");
  const ico = new THREE.IcosahedronGeometry(1, 1);
  const Z = new THREE.Vector3(0, 0, 1);
  for (let placed = 0, tries = 0; placed < 38 && tries < 2000; tries++) {
    const phi = rnd() * Math.PI * 2;
    const th = (35 + rnd() * 27) * rad;
    if (Math.sin(phi) < -0.45 && th > 48 * rad) continue;
    const d = new THREE.Vector3(
      Math.sin(th) * Math.cos(phi),
      Math.sin(th) * Math.sin(phi),
      Math.cos(th)
    );
    const r = 0.07 + rnd() * 0.08;
    const m = add(ico, pick(), [d.x * 1.04, d.y * 0.95 * 1.0 + d.y * 0.04, BZ + d.z * 0.97 + d.z * 0.04], null, [r, r, r * 0.65]);
    m.quaternion.setFromUnitVectors(Z, d);
    placed++;
  }
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const r = 0.07 + rnd() * 0.04;
      add(ico, pick(), [sx * (1.05 + rnd() * 0.25), (rnd() - 0.5) * 0.24, 1.62 + rnd() * 0.16], null, [r, r, r * 0.6], bn["shoulder" + (sx < 0 ? "L" : "R")]);
    }
    add(ico, "moss2", [sx * 0.5, 0.15, 0.4], null, [0.07, 0.07, 0.05], bn["ankle" + (sx < 0 ? "L" : "R")]);
  }

  root.add(model);
  model.rotation.x = -Math.PI / 2;
  model.scale.setScalar(ROBOT_SCALE);
  model.position.y = ROBOT_ROOT_OFFSET_Y;

  return { root, model, bones: bn, eyes };
}
