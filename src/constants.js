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

export const PILE_DENSE_THRESHOLD = 2000;
export const PILE_DENSE_RADIUS = 15;
export const PILE_DENSE_COLUMN_CELL = 0.9;
export const PILE_DENSE_COLUMN_HEIGHT = 1.6;
export const PILE_DENSE_COLUMN_JITTER = 0.25;

export const SETTLE_WAVE_STEPS = 18;
export const OBJECT_FLOOR_RESET_DEPTH = -0.9;
export const OBJECT_RESURFACE_Y = 0.55;

export const SETTLE_MAX_STEPS = 240;
export const SETTLE_CHECK_INTERVAL = 60;
export const SETTLE_ACTIVE_SPEED = 0.4;
export const SETTLE_ACTIVE_LIMIT = 30;

export const OBJECT_COUNT_DEFAULT = 1000;
export const OBJECT_COUNT_SETTLE_BIG_THRESHOLD = 4000;
export const SETTLE_MAX_STEPS_BIG = 220;
export const SETTLE_TAIL_STEPS = 150;

export const FLOOR_GUARD_INTERVAL = 0.6;
export const FLOOR_GUARD_DEPTH = -1.5;
export const FLOOR_GUARD_PLAYER_DEPTH = -1.4;
export const MAX_BODIES_CAPACITY = 10600;
export const MAX_BODY_PAIRS = 65536;
export const MAX_CONTACT_CONSTRAINTS = 16384;

export const PLAYER_MOVE_GROUND_CONTROL = 16;
export const PLAYER_MOVE_AIR_CONTROL = 4.5;
export const PLAYER_BRAKE_LAMBDA = 20;

export const HOLD_SPRING_STIFFNESS = 16;
export const HOLD_MAX_SPEED = 26;
export const HOLD_DROP_DISTANCE = 3.6;
export const REMOTE_HELD_SNAP_DISTANCE = 1.5;
export const REMOTE_HELD_SNAP_Y = 0.35;

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

export const PIT_CENTER_X = 18;
export const PIT_CENTER_Z = -18;
export const PIT_HALF_X = 1.4;
export const PIT_HALF_Z = 1.4;
export const PIT_WALL_THICKNESS = 0.28;
export const PIT_DEPTH = 2.2;

export const SHREDDER_SHAFT_AXIS_Y = -1.25;
export const SHREDDER_SHAFT_OFFSET_Z = 0.4;
export const SHREDDER_DISC_RADIUS = 0.32;
export const SHREDDER_DISC_HALF_HEIGHT = 0.07;
export const SHREDDER_DISC_PITCH = 0.4;
export const SHREDDER_DISC_COUNT = 5;
export const SHREDDER_DISC_FRICTION = 0.8;
export const SHREDDER_OMEGA = 4.2;
export const SHRED_TRIGGER_DEPTH = -0.55;
export const SHRED_REMOVE_DEPTH = -1.7;
export const SHRED_ABSORB_GAP_Z = 0.2;
export const SHRED_FUNNEL_BLEND = 10;
export const SHRED_FUNNEL_SINK = -3.2;
export const SHRED_FUNNEL_STEER = 2.6;
export const SHRED_PLAYER_ESCAPE_DEPTH = -0.25;

export const CONFETTI_MAX = 260;
export const CONFETTI_PER_SHRED = 26;
export const CONFETTI_WIDTH = 0.09;
export const CONFETTI_HEIGHT = 0.13;
export const CONFETTI_LIFE_MIN = 1.2;
export const CONFETTI_LIFE_MAX = 2.1;
export const CONFETTI_SPEED_MIN = 2.2;
export const CONFETTI_SPEED_MAX = 4.8;
export const CONFETTI_UP_BIAS = 0.74;
export const CONFETTI_LATERAL_SPREAD = 1.8;
export const CONFETTI_FLIP_SPEED = 10;
export const CONFETTI_DRAG = 1.5;
export const CONFETTI_GRAVITY = 4.2;
export const CONFETTI_FADE_TAIL = 0.32;
export const CONFETTI_SCALE_MIN = 0.7;
export const CONFETTI_SCALE_MAX = 1.25;
export const CONFETTI_ORIGIN_Y = -0.5;

export const LEADERBOARD_KEY = "stickman_leaderboard_v1";
export const LEADERBOARD_SIZE = 10;

export const UFO_HEIGHT = 22;
export const UFO_SPREAD_RADIUS = 1.4;
export const UFO_TUBE_RADIUS = 1.6;
export const UFO_TUBE_HEIGHT = 12;
export const UFO_RELEASE_RATE = 1200;
export const UFO_DROP_SPEED = 1.5;
export const UFO_VISUAL_Y = 16;

export const SCENE_MAIN = "main";
export const SCENE_LAKE = "lake";
export const SCENE_URL_PARAM = "scene";

export const LAKE_SIZE = 200;
export const LAKE_WATER_LEVEL = -0.35;
export const LAKE_WATER_SIZE = 100;
export const LAKE_WATER_SEGMENTS = 200;
export const LAKE_TERRAIN_VISUAL_SEGMENTS = 128;
export const LAKE_TERRAIN_PHYSICS_SEGMENTS = 96;
export const LAKE_PLAYER_SPAWN_X = 0;
export const LAKE_PLAYER_SPAWN_Z = 34;
export const LAKE_SPAWN_CLEARANCE = 0.35;
export const LAKE_PILE_CENTER_X = 14;
export const LAKE_PILE_CENTER_Z = 28;
export const LAKE_PILE_RADIUS = 3.2;
export const LAKE_TRASH_COUNT = 140;
export const LAKE_GRASS_COUNT = 12000;
export const LAKE_TREE_COUNT = 220;
export const LAKE_FLOWER_COUNT = 320;
export const LAKE_OUT_OF_BOUNDS_RADIUS = 58;
export const LAKE_OBJECT_RESET_DEPTH = -3.5;
export const LAKE_FOG_DENSITY = 0.011;
export const LAKE_SKY_RADIUS = 600;
export const LAKE_CAMERA_FAR = 1200;
export const ROBOT_SCALE = 0.5;
export const ROBOT_ROOT_OFFSET_Y = -0.88;

export const ROBOT_WALK_SPEED_THRESHOLD = 0.35;
export const ROBOT_BLINK_INTERVAL = 2.6;
export const ROBOT_BLINK_DURATION = 0.12;

export const LAKE_HILL_AMPLITUDE = 2.2;
export const LAKE_HILL_BASE = 2.2;
export const LAKE_HILL_OFFSET = 0.3;
export const LAKE_HILL_FREQ_X1 = 0.045;
export const LAKE_HILL_PHASE_X1 = 1;
export const LAKE_HILL_FREQ_Z1 = 0.05;
export const LAKE_HILL_WEIGHT_2 = 0.6;
export const LAKE_HILL_FREQ_X2 = 0.11;
export const LAKE_HILL_FREQ_Z2 = 0.09;
export const LAKE_HILL_WEIGHT_3 = 0.3;
export const LAKE_HILL_FREQ_X3 = 0.23;
export const LAKE_HILL_FREQ_Z3 = 0.19;

export const LAKE_BASIN_DEPTH = 4.5;
export const LAKE_BASIN_RADIUS = 30;
export const LAKE_DD_AMP1 = 0.14;
export const LAKE_DD_FREQ1 = 3;
export const LAKE_DD_PHASE1 = 1;
export const LAKE_DD_AMP2 = 0.08;
export const LAKE_DD_FREQ2 = 5;
export const LAKE_DD_PHASE2 = 2;
export const LAKE_RIM_INNER = 26;
export const LAKE_RIM_OUTER = 60;
export const LAKE_SHORE_HEIGHT = 0.35;
export const LAKE_SHORE_INNER = 26;
export const LAKE_SHORE_OUTER = 34;
export const LAKE_OUTER_HILL_START = 70;
export const LAKE_OUTER_HILL_END = 100;
export const LAKE_OUTER_HILL_HEIGHT = 10;

export const LAKE_WAVE_DIRS = [0.3, 1.1, -0.7, 2.0];
export const LAKE_WAVE_AMPS = [0.05, 0.03, 0.02, 0.012];
export const LAKE_WAVE_KS = [0.55, 0.9, 1.4, 2.3];
export const LAKE_GRAVITY = 9.8;
