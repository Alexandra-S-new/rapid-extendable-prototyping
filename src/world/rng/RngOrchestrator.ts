import type { RandomSource } from '../ports.js';
import { deriveSeed, streamKey } from './deriveSeed.js';

export type RandomSourceFactory = (initialState: number) => RandomSource;

// RngOrchestrator (Subtask 2 §8/§16, Subtask 3.10/3.12): Substream-
// Orchestrierung. Kennt keinen Algorithmus — erhält die konkrete
// RandomSource-Fabrik per Dependency Injection (kein Import aus random/,
// world/ hängt ausschließlich von domain ab).
//
// Nach jeder Verwendung eines Streams wird dessen getState() ausgelesen und
// in rngState.streamStates zurückgeschrieben (Subtask 3.12) — dadurch bleibt
// jeder Substream über Save/Load hinweg exakt fortsetzbar.
export class RngOrchestrator {
  private readonly active = new Map<string, RandomSource>();

  constructor(
    private readonly rngState: { masterSeed: number; streamStates: Record<string, number> },
    private readonly createSource: RandomSourceFactory,
  ) {}

  stream(name: string, ...keyParts: (string | number)[]): RandomSource {
    const key = streamKey(name, ...keyParts);
    const cached = this.active.get(key);
    if (cached) return cached;

    const initialState = this.rngState.streamStates[key] ?? deriveSeed(this.rngState.masterSeed, name, ...keyParts);
    const real = this.createSource(initialState);
    this.rngState.streamStates[key] = initialState;

    const wrapped: RandomSource = {
      nextFloat: () => {
        const value = real.nextFloat();
        this.rngState.streamStates[key] = real.getState();
        return value;
      },
      nextInt: (maxExclusive: number) => {
        const value = real.nextInt(maxExclusive);
        this.rngState.streamStates[key] = real.getState();
        return value;
      },
      getState: () => real.getState(),
    };

    this.active.set(key, wrapped);
    return wrapped;
  }
}
