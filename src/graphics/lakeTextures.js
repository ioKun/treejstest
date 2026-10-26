import * as THREE from "three";
import { LAKE_SIZE } from "../constants.js";
import { lakeHeight } from "../scenes/lake/terrainMath.js";

const R_ = (a, b) => a + Math.random() * (b - a);

function canvasTex(sz, draw, rx, ry) {
  const cn = document.createElement("canvas");
  cn.width = sz;
  cn.height = sz;
  draw(cn.getContext("2d"), sz);
  const t = new THREE.CanvasTexture(cn);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeGrassTexture() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#d6d6d6";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      const x = R_(0, s);
      const y = R_(0, s);
      const r = R_(10, 35);
      const v = R_(150, 255) | 0;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${v},${v},${v},.35)`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 2500; i++) {
      const x = R_(0, s);
      const y = R_(0, s);
      const l = R_(3, 9);
      const a = -Math.PI / 2 + R_(-0.5, 0.5);
      const v = R_(120, 255) | 0;
      g.strokeStyle = `rgba(${v},${v},${v},.5)`;
      g.lineWidth = R_(0.6, 1.4);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  }, 48, 48);
}

export function makeBarkTexture(rx, ry) {
  const rrx = rx == null ? 2 : rx;
  const rry = ry == null ? 3 : ry;
  return canvasTex(128, (g, s) => {
    g.fillStyle = "#8a6a48";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) {
      const x = R_(0, s);
      const v = R_(30, 200) | 0;
      g.strokeStyle = `rgba(${v},${v * 0.8 | 0},${v * 0.6 | 0},.45)`;
      g.lineWidth = R_(1, 4);
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + R_(-6, 6), s * 0.3, x + R_(-6, 6), s * 0.7, x + R_(-4, 4), s);
      g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = "rgba(30,20,10,.35)";
      g.fillRect(R_(0, s), R_(0, s), R_(2, 6), R_(1, 3));
    }
  }, rrx, rry);
}

export function makeFoliageTexture(rx, ry) {
  const rrx = rx == null ? 1 : rx;
  const rry = ry == null ? 1 : ry;
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#c9d4b8";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 3500; i++) {
      const x = R_(0, s);
      const y = R_(0, s);
      const l = R_(6, 14);
      const a = Math.PI / 2 + R_(-0.8, 0.8);
      const v = R_(90, 255) | 0;
      g.strokeStyle = `rgba(${v * 0.8 | 0},${v},${v * 0.65 | 0},.55)`;
      g.lineWidth = R_(0.8, 1.8);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = "rgba(40,60,30,.4)";
      g.beginPath();
      g.arc(R_(0, s), R_(0, s), R_(2, 4), 0, 6.28);
      g.fill();
    }
  }, rrx, rry);
}

export function makeLakeHeightTexture() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const h = lakeHeight((i / (N - 1) - 0.5) * LAKE_SIZE, (j / (N - 1) - 0.5) * LAKE_SIZE);
      const v = Math.min(255, Math.max(0, Math.round((h + 6) / 30 * 255)));
      data.set([v, 0, 0, 255], (j * N + i) * 4);
    }
  }
  const htex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  htex.minFilter = THREE.LinearFilter;
  htex.magFilter = THREE.LinearFilter;
  htex.needsUpdate = true;
  return htex;
}
