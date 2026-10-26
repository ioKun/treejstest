import {
  LAKE_HILL_AMPLITUDE,
  LAKE_HILL_BASE,
  LAKE_HILL_OFFSET,
  LAKE_HILL_FREQ_X1,
  LAKE_HILL_PHASE_X1,
  LAKE_HILL_FREQ_Z1,
  LAKE_HILL_WEIGHT_2,
  LAKE_HILL_FREQ_X2,
  LAKE_HILL_FREQ_Z2,
  LAKE_HILL_WEIGHT_3,
  LAKE_HILL_FREQ_X3,
  LAKE_HILL_FREQ_Z3,
  LAKE_BASIN_DEPTH,
  LAKE_BASIN_RADIUS,
  LAKE_DD_AMP1,
  LAKE_DD_FREQ1,
  LAKE_DD_PHASE1,
  LAKE_DD_AMP2,
  LAKE_DD_FREQ2,
  LAKE_DD_PHASE2,
  LAKE_RIM_INNER,
  LAKE_RIM_OUTER,
  LAKE_SHORE_HEIGHT,
  LAKE_SHORE_INNER,
  LAKE_SHORE_OUTER,
  LAKE_OUTER_HILL_START,
  LAKE_OUTER_HILL_END,
  LAKE_OUTER_HILL_HEIGHT,
  LAKE_WAVE_DIRS,
  LAKE_WAVE_AMPS,
  LAKE_WAVE_KS,
  LAKE_GRAVITY,
} from "../../constants.js";

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hills(x, z) {
  return Math.max(
    0,
    LAKE_HILL_AMPLITUDE *
      (Math.sin(x * LAKE_HILL_FREQ_X1 + LAKE_HILL_PHASE_X1) *
        Math.cos(z * LAKE_HILL_FREQ_Z1) +
        LAKE_HILL_WEIGHT_2 *
          Math.sin(x * LAKE_HILL_FREQ_X2 + z * LAKE_HILL_FREQ_Z2) +
        LAKE_HILL_WEIGHT_3 *
          Math.sin(x * LAKE_HILL_FREQ_X3 - z * LAKE_HILL_FREQ_Z3)) +
      LAKE_HILL_BASE
  ) + LAKE_HILL_OFFSET;
}

export function lakeHeight(x, z) {
  const d = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const dd =
    d *
    (1 +
      LAKE_DD_AMP1 * Math.sin(LAKE_DD_FREQ1 * a + LAKE_DD_PHASE1) +
      LAKE_DD_AMP2 * Math.sin(LAKE_DD_FREQ2 * a + LAKE_DD_PHASE2));
  return (
    -LAKE_BASIN_DEPTH * (1 - smoothstep(0, LAKE_BASIN_RADIUS, dd)) +
    hills(x, z) * smoothstep(LAKE_RIM_INNER, LAKE_RIM_OUTER, dd) +
    LAKE_SHORE_HEIGHT * smoothstep(LAKE_SHORE_INNER, LAKE_SHORE_OUTER, dd) +
    LAKE_OUTER_HILL_HEIGHT * smoothstep(LAKE_OUTER_HILL_START, LAKE_OUTER_HILL_END, d)
  );
}

export function lakeWaveHeight(x, z, time) {
  let h = 0;
  for (let i = 0; i < LAKE_WAVE_DIRS.length; i++) {
    const dir = LAKE_WAVE_DIRS[i];
    const cos = Math.cos(dir);
    const sin = Math.sin(dir);
    const amp = LAKE_WAVE_AMPS[i];
    const k = LAKE_WAVE_KS[i];
    h += amp * Math.sin((cos * x + sin * z) * k - Math.sqrt(LAKE_GRAVITY * k) * time);
  }
  return h;
}
