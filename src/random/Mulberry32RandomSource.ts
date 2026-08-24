import type { RandomSource } from '../world/ports.js';

// Mulberry32RandomSource (Subtask 2 §8, Subtask 3.10): Infrastructure-Adapter,
// implementiert den RandomSource-Port. 32-Bit-State, ein Multiply-XOR-Shift-
// Schritt pro Ziehung — bewusst selbst implementiert (keine Kryptographie
// nötig, minimaler Code, volle Kontrolle über Persistenz des Zustands).
export class Mulberry32RandomSource implements RandomSource {
  private state: number;

  constructor(initialState: number) {
    this.state = initialState >>> 0;
  }

  private nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0 || !Number.isInteger(maxExclusive)) {
      throw new RangeError('maxExclusive must be a positive integer');
    }
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  getState(): number {
    return this.state;
  }
}
