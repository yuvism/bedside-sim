/**
 * Seeded random numbers. The whole generator state is one 32-bit integer, so
 * it serialises into EngineState and replays exactly. Algorithm: mulberry32.
 */

/** Spread a user-facing seed (any integer) into a well-mixed starting state. */
export function seedToState(seed: number): number {
  let z = (seed | 0) + 0x9e3779b9;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) | 0;
}

export class Rng {
  state: number;

  constructor(state: number) {
    this.state = state | 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** value ± spread, uniformly. */
  jitter(value: number, spread: number): number {
    return spread > 0 ? value + this.uniform(-spread, spread) : value;
  }

  /** Standard normal (Box–Muller; uses two draws, no cached spare). */
  normal(): number {
    const u1 = Math.max(this.next(), 1e-12);
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

/**
 * One exact step of an Ornstein–Uhlenbeck process: smooth noise that wanders
 * around 0 with standard deviation `sigma` and correlation time `tauSec`.
 */
export function ouStep(x: number, tauSec: number, sigma: number, dtSec: number, z: number): number {
  const a = Math.exp(-dtSec / tauSec);
  return x * a + sigma * Math.sqrt(1 - a * a) * z;
}
