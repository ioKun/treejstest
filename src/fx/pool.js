export function acquireEffect(pool) {
  const free = pool.find((effect) => !effect.active);
  if (free) return free;

  return pool.reduce(
    (oldest, effect) => (effect.age > oldest.age ? effect : oldest),
    pool[0]
  );
}
