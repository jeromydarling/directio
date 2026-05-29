/**
 * Tiny deterministic helpers used by every demo-seeder module.
 *
 * `makeRng` returns a cheap PRNG seeded by a string (we use the new org id),
 * so a given seed run is reproducible if we ever need to debug it.
 */

export function makeRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function randPhone(rng: () => number): string {
  const a = 200 + Math.floor(rng() * 800);
  const b = 100 + Math.floor(rng() * 900);
  const c = 1000 + Math.floor(rng() * 9000);
  return `${a}-${b}-${c}`;
}

export function pad(n: number, w = 2): string {
  return n.toString().padStart(w, "0");
}
