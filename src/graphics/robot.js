import * as THREE from "three";
import { engine } from "../engine.js";
import { state, playerVel } from "../state.js";
import {
  ROBOT_WALK_SPEED_THRESHOLD,
  ROBOT_BLINK_INTERVAL,
  ROBOT_BLINK_DURATION,
} from "../constants.js";
import { createRobotModel } from "./robotModel.js";
import { readPlayerState } from "../physics/helpers.js";

const D = Math.PI * 2;
const A = 0.55;
const Q = new THREE.Quaternion();
const E = new THREE.Euler(0, 0, 0, "ZYX");

const W = 1.1;
const I = 3;

let modelRef = null;
let bonesRef = null;
let eyesRef = [];
let eyesBaseRef = [];
let mixerRef = null;
const actionsRef = {};
const clipsRef = {};
const cur = {};

let blinkTimer = 0;
let blinkRemaining = 0;

function qt(k, dur, fn, n = 24) {
  if (!bonesRef || !bonesRef[k]) return null;
  const ts = [];
  const vs = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    E.set(...fn(p));
    Q.setFromEuler(E);
    ts.push(p * dur);
    vs.push(Q.x, Q.y, Q.z, Q.w);
  }
  return new THREE.QuaternionKeyframeTrack(k + ".quaternion", ts, vs);
}

function pt(k, dur, fn, n = 24) {
  if (!bonesRef || !bonesRef[k]) return null;
  const ts = [];
  const vs = [];
  const r = bonesRef[k].position.clone();
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const o = fn(p);
    ts.push(p * dur);
    vs.push(r.x + o[0], r.y + o[1], r.z + o[2]);
  }
  return new THREE.VectorKeyframeTrack(k + ".position", ts, vs);
}

function pushTrack(arr, track) {
  if (track) arr.push(track);
}

function fadeTo(slot, next) {
  if (!next) return;
  if (cur[slot] === next) return;
  next.reset().setEffectiveWeight(1).play();
  if (cur[slot]) cur[slot].crossFadeTo(next, 0.35, false);
  cur[slot] = next;
}

export function buildRobotPlayer() {
  const created = createRobotModel();
  const root = created.root;
  const model = created.model;
  const bones = created.bones;
  const eyes = created.eyes || [];

  modelRef = model;
  bonesRef = bones;
  eyesRef = eyes;
  eyesBaseRef = eyes.map((e) => (e && e.scale ? e.scale.clone() : new THREE.Vector3(1, 1, 1)));

  const bW = [];
  const bI = [];
  const uW = [];
  const uI = [];
  const uH = [];

  pushTrack(bW, pt("hips", W, (p) => [0, 0, 0.52 * (Math.cos(A * Math.abs(Math.sin(D * p))) - 1)]));
  pushTrack(bW, qt("ant", W, (p) => [0.3 * Math.sin(D * 2 * p + 1), 0.1 * Math.sin(D * p), 0]));
  pushTrack(uW, qt("torso", W, (p) => [0, 0.05 * Math.sin(D * p), 0.12 * Math.sin(D * p)]));
  pushTrack(bI, pt("hips", I, (p) => [0, 0, 0.012 * Math.sin(D * p)]));
  pushTrack(bI, qt("ant", I, (p) => [0.15 * Math.sin(D * p + 1), 0.1 * Math.sin(D * p), 0]));
  pushTrack(uI, qt("torso", I, (p) => [0.012 * Math.sin(D * p), 0, 0.03 * Math.sin(D * p)]));
  pushTrack(uH, qt("torso", I, (p) => [0.012 * Math.sin(D * p), 0, 0]));

  for (const S of ["L", "R"]) {
    const ph = S === "L" ? 0 : Math.PI;
    const m = S === "L" ? 1 : -1;
    const th = (p) => D * p + ph;
    pushTrack(bW, qt("hip" + S, W, (p) => [A * Math.sin(th(p)), 0, 0]));
    pushTrack(bW, qt("ankle" + S, W, (p) => [-0.6 * A * Math.sin(th(p)), 0, 0]));
    pushTrack(uW, qt("shoulder" + S, W, (p) => [-0.7 * Math.sin(th(p)), m * 0.06, 0]));
    pushTrack(uW, qt("elbow" + S, W, (p) => [-0.45 - 0.2 * Math.cos(th(p)), 0, 0]));
    pushTrack(uI, qt("shoulder" + S, I, (p) => [0.04 * Math.sin(D * p + ph), m * 0.03, 0]));
    pushTrack(uI, qt("elbow" + S, I, (p) => [-0.12, 0, 0]));
    const h = [0, [-0.714, -0.338, 0.463], -0.396];
    pushTrack(uH, qt("shoulder" + S, I, (p) => [h[1][0] + 0.02 * Math.sin(D * p), m * h[1][1], m * h[1][2]]));
    pushTrack(uH, qt("elbow" + S, I, (p) => [h[2] + 0.03 * Math.sin(D * p + 1), 0, 0]));
  }

  const clipBw = new THREE.AnimationClip("bW", W, bW);
  const clipBi = new THREE.AnimationClip("bI", I, bI);
  const clipUw = new THREE.AnimationClip("uW", W, uW);
  const clipUi = new THREE.AnimationClip("uI", I, uI);
  const clipUh = new THREE.AnimationClip("uH", I, uH);

  const mixer = new THREE.AnimationMixer(model);
  const mkA = (name, dur, tracks) => mixer.clipAction(new THREE.AnimationClip(name, dur, tracks));

  const actBw = mkA("bW", W, bW);
  const actBi = mkA("bI", I, bI);
  const actUw = mkA("uW", W, uW);
  const actUi = mkA("uI", I, uI);
  const actUh = mkA("uH", I, uH);

  const actions = {
    bW: actBw,
    bI: actBi,
    uW: actUw,
    uI: actUi,
    uH: actUh,
    walk: actBw,
    idle: actBi,
    upperWalk: actUw,
    upperIdle: actUi,
    upperHold: actUh,
  };

  const clips = {
    bW: clipBw,
    bI: clipBi,
    uW: clipUw,
    uI: clipUi,
    uH: clipUh,
    walk: clipBw,
    idle: clipBi,
    upperWalk: clipUw,
    upperIdle: clipUi,
    upperHold: clipUh,
  };

  mixerRef = mixer;
  Object.keys(actions).forEach((k) => {
    actionsRef[k] = actions[k];
  });
  Object.keys(clips).forEach((k) => {
    clipsRef[k] = clips[k];
  });

  root.position.copy(state.playerSpawn);

  engine.scene.add(root);

  state.playerRoot = root;
  state.playerVisual = {
    kind: "robot",
    root,
    model,
    bones,
    eyes,
    eyesBase: eyesBaseRef,
    mixer,
    actions,
    clips,
    cur,
    userData: { eyesBase: eyesBaseRef },
  };

  blinkTimer = 0;
  blinkRemaining = 0;

  fadeTo("base", actions.bW);
  fadeTo("up", actions.uW);

  return root;
}

export function animateRobot(dt) {
  if (!mixerRef) return;
  const actions = actionsRef;
  if (!actions.bW || !actions.bI || !actions.uW || !actions.uI || !actions.uH) return;

  if (state.playerBody) {
    try {
      readPlayerState();
    } catch (e) {
    }
  }

  const speed = Math.hypot(playerVel.x, playerVel.z);
  const walking = speed > ROBOT_WALK_SPEED_THRESHOLD;

  const baseAction = walking ? actions.bW : actions.bI;
  const upperAction = state.held ? actions.uH : (walking ? actions.uW : actions.uI);

  fadeTo("base", baseAction);
  fadeTo("up", upperAction);

  blinkTimer += dt;
  if (blinkTimer >= ROBOT_BLINK_INTERVAL) {
    blinkTimer = 0;
    blinkRemaining = ROBOT_BLINK_DURATION;
  }
  if (blinkRemaining > 0) {
    blinkRemaining = Math.max(0, blinkRemaining - dt);
  }
  let k = 1;
  if (blinkRemaining > 0) {
    const blinkPhase = 1 - blinkRemaining / ROBOT_BLINK_DURATION;
    k = Math.max(0.08, Math.abs(1 - 2 * blinkPhase));
  }
  for (let i = 0; i < eyesRef.length; i++) {
    const eye = eyesRef[i];
    if (eye && eye.scale) {
      const base = eyesBaseRef[i];
      const baseZ = base ? base.z : eye.scale.z;
      eye.scale.z = baseZ * k;
    }
  }

  mixerRef.update(dt);
}
