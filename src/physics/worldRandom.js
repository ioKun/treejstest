let seed = ((Math.random() * 0xffffffff) >>> 0) || 1;

export function setWorldSeed(value) {
  seed = (value >>> 0) || 1;
}

export function getWorldSeed() {
  return seed;
}

export function worldRandom() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
