import * as THREE from "three";

export const FIXED_DT = 1 / 60;
export const MAX_SUBSTEPS = 5;

export const LAYER_NON_MOVING = 0;
export const LAYER_MOVING = 1;
export const LAYER_PORTAL = 2;
export const LAYER_STUCK = 3;
export const NUM_LAYERS = 4;

export const PLAYER_RADIUS = 0.28;
export const PLAYER_HALF_HEIGHT = 0.55;
export const PLAYER_HALF_TOTAL = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
export const PLAYER_SPAWN_Y = PLAYER_HALF_TOTAL + 0.2;

export const WALK_SPEED = 4.2;
export const RUN_SPEED = 6.8;
export const JUMP_SPEED = 5.3;
export const GRAB_DISTANCE = 5;
export const GRAB_CONE = Math.cos(THREE.MathUtils.degToRad(42));
export const HOLD_DISTANCE = 1.05;
export const THROW_SPEED = 12;

export const GROUND_HALF_SIZE = 40;

export const PILE_CENTER_Z = -16;
export const PILE_BASE_RADIUS = 12;
export const PILE_LAYERS = 7;
export const PILE_LAYER_SHRINK = 1.5;
export const PILE_LAYER_HEIGHT = 0.9;
export const PILE_CELL = 1.16;
export const PILE_JITTER = 0.04;

export const SETTLE_MAX_STEPS = 240;
export const SETTLE_CHECK_INTERVAL = 60;
export const SETTLE_ACTIVE_SPEED = 0.4;
export const SETTLE_ACTIVE_LIMIT = 30;

export const PLAYER_MOVE_GROUND_CONTROL = 16;
export const PLAYER_MOVE_AIR_CONTROL = 4.5;
export const PLAYER_BRAKE_LAMBDA = 20;

export const HOLD_SPRING_STIFFNESS = 16;
export const HOLD_MAX_SPEED = 26;
export const HOLD_DROP_DISTANCE = 3.6;

export const PICKUP_MIN_DISTANCE = 0.25;
export const GRAB_SCORE_DOT_WEIGHT = 1.4;
export const THROW_DROP_NUDGE = 1.2;

export const BLAST_RADIUS = 5.5;
export const BLAST_SPEED = 11;
export const SPECIAL_FUSE = 0.6;
export const MAX_SPARKS = 400;

export const BLACKHOLE_RADIUS = 7.5;
export const BLACKHOLE_DURATION = 4.5;
export const BLACKHOLE_PULL = 16;
export const BLACKHOLE_SWIRL = 3.5;
export const BLACKHOLE_ABSORB_RADIUS = 0.65;
export const BLACKHOLE_ABSORB_RATE = 5;
export const BLACKHOLE_VELOCITY_BLEND = 0.2;

export const PORTAL_RADIUS = 3.2;
export const PORTAL_DURATION = 7.5;
export const PORTAL_CAPTURE_HEIGHT = 1.5;
export const PORTAL_REMOVE_DEPTH = -0.65;

export const CAPSULE_GROW = 2.8;
export const CAPSULE_STICK_PADDING = 0.05;

export const TORNADO_RADIUS = 2;
export const TORNADO_HEIGHT = 4.2;
export const TORNADO_DURATION = 5;
export const TORNADO_SPEED = 6.5;
export const TORNADO_PULL = 15;
export const TORNADO_SWIRL = 16;
export const TORNADO_LIFT = 9.5;
export const TORNADO_PARTICLES = 80;
export const TORNADO_VELOCITY_BLEND = 0.16;

export const GROUND_EDGE_MARGIN = 0.5;
