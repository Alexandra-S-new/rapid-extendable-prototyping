import { describe, it, expect } from 'vitest';
import { Mulberry32RandomSource } from '../../src/random/Mulberry32RandomSource.js';
import { RngOrchestrator } from '../../src/world/rng/RngOrchestrator.js';
import { deriveSeed } from '../../src/world/rng/deriveSeed.js';

describe('Mulberry32RandomSource (Subtask 2 §8)', () => {
  it('liefert deterministische, reproduzierbare Sequenzen für denselben Seed', () => {
    const a = new Mulberry32RandomSource(42);
    const b = new Mulberry32RandomSource(42);
    const seqA = Array.from({ length: 10 }, () => a.nextFloat());
    const seqB = Array.from({ length: 10 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it('liefert unterschiedliche Sequenzen für unterschiedliche Seeds', () => {
    const a = new Mulberry32RandomSource(1);
    const b = new Mulberry32RandomSource(2);
    expect(a.nextFloat()).not.toBe(b.nextFloat());
  });

  it('nextFloat liegt in [0,1)', () => {
    const rng = new Mulberry32RandomSource(7);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('getState() erlaubt exaktes Fortsetzen an derselben Stelle', () => {
    const rng = new Mulberry32RandomSource(123);
    rng.nextFloat();
    rng.nextFloat();
    const state = rng.getState();
    const expected = rng.nextFloat();

    const resumed = new Mulberry32RandomSource(state);
    expect(resumed.nextFloat()).toBe(expected);
  });
});

describe('deriveSeed (FNV-1a, Subtask 2 §8)', () => {
  it('ist deterministisch für gleiche Eingaben', () => {
    expect(deriveSeed(1, 'weather')).toBe(deriveSeed(1, 'weather'));
  });

  it('liefert unterschiedliche Seeds für unterschiedliche Substream-Namen', () => {
    expect(deriveSeed(1, 'weather')).not.toBe(deriveSeed(1, 'production'));
  });

  it('liefert unterschiedliche Seeds für unterschiedliche Entities (Pro-Agent-Streams)', () => {
    expect(deriveSeed(1, 'agent-decision', 5)).not.toBe(deriveSeed(1, 'agent-decision', 6));
  });
});

describe('RngOrchestrator (Subtask 2 §8/§16, Subtask 3.7/3.10/3.12)', () => {
  function makeOrchestrator() {
    const rngState = { masterSeed: 1, streamStates: {} as Record<string, number> };
    const orchestrator = new RngOrchestrator(rngState, (state) => new Mulberry32RandomSource(state));
    return { rngState, orchestrator };
  }

  it('agent-decision und agent-action sind getrennte Streams für dieselbe Entity (Subtask 3.7)', () => {
    const { orchestrator } = makeOrchestrator();
    const decision = orchestrator.stream('agent-decision', 42);
    const action = orchestrator.stream('agent-action', 42);
    expect(decision.nextFloat()).not.toBe(action.nextFloat());
  });

  it('Ziehungen aus einem Stream beeinflussen einen anderen Stream nicht (Invariante I8)', () => {
    const { orchestrator: o1 } = makeOrchestrator();
    const untouched = o1.stream('weather').nextFloat();

    const { orchestrator: o2 } = makeOrchestrator();
    o2.stream('production').nextFloat();
    o2.stream('production').nextFloat();
    o2.stream('production').nextFloat();
    const stillUntouched = o2.stream('weather').nextFloat();

    expect(stillUntouched).toBe(untouched);
  });

  it('schreibt den Stream-Zustand nach jeder Verwendung in streamStates zurück (Subtask 3.12)', () => {
    const { rngState, orchestrator } = makeOrchestrator();
    const stream = orchestrator.stream('weather');
    expect(rngState.streamStates['weather']).toBeDefined();
    const before = rngState.streamStates['weather'];
    stream.nextFloat();
    expect(rngState.streamStates['weather']).not.toBe(before);
  });

  it('ein neu erzeugter Orchestrator mit denselben persistierten streamStates setzt exakt fort', () => {
    const { rngState, orchestrator } = makeOrchestrator();
    const stream = orchestrator.stream('weather');
    stream.nextFloat();
    stream.nextFloat();

    // Snapshot NACH dem 2. Zug, VOR dem 3. Zug — der neue Orchestrator muss
    // exakt den 3. Zug reproduzieren.
    const resumedState = { masterSeed: 1, streamStates: { ...rngState.streamStates } };
    const expected = stream.nextFloat();

    const resumed = new RngOrchestrator(resumedState, (state) => new Mulberry32RandomSource(state));
    expect(resumed.stream('weather').nextFloat()).toBe(expected);
  });

  it('erzeugt Substreams lazy — kein Eintrag ohne tatsächliche Nutzung', () => {
    const { rngState } = makeOrchestrator();
    expect(Object.keys(rngState.streamStates)).toHaveLength(0);
  });
});
