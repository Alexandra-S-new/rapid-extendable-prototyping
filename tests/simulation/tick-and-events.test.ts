import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { makeTestConfig } from '../helpers/testConfig.js';

describe('SimulationEngine.tick() — Phasenreihenfolge (Subtask 2 §6)', () => {
  it('erhöht currentTick um genau 1 pro tick()-Aufruf', () => {
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.tick();
    expect(engine.getWorld().clock.currentTick).toBe(1);
    engine.tick();
    expect(engine.getWorld().clock.currentTick).toBe(2);
  });

  it('run(n) führt exakt n Ticks aus', () => {
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.run(10);
    expect(engine.getWorld().clock.currentTick).toBe(10);
  });

  it('Neugeborene nehmen nicht mehr am selben Tick teil (Subtask 2 §3/§6)', () => {
    const config = makeTestConfig({
      reproduction: { minAdultAgeTicks: 0, birthProbabilityPerEligiblePair: 1, crisisThreshold: 0 },
      initialPopulation: { humans: 2, animals: 0 },
    });
    const engine = SimulationEngine.create(config, new ConsoleLogger('error'));
    const beforeCount = engine.getWorld().entities.alive.length;
    engine.tick();
    const afterCount = engine.getWorld().entities.alive.length;
    // Es kann höchstens ein Kind pro Tick für dieses eine Paar entstehen;
    // entscheidend ist, dass die Population sich nicht durch mehrfache
    // Teilnahme desselben Ticks explosionsartig vervielfacht.
    expect(afterCount).toBeLessThanOrEqual(beforeCount + 1);
  });
});

describe('Event-System (Subtask 2 §7, Subtask 3.9)', () => {
  it('nextSequence wächst monoton unabhängig von der begrenzten History', () => {
    const config = makeTestConfig({ observability: { eventHistoryCapacity: 2, logLevel: 'error' } });
    const engine = SimulationEngine.create(config, new ConsoleLogger('error'));
    engine.run(30);
    const world = engine.getWorld();
    const sequences = world.events.history.toArray().map((e) => e.sequence);
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]!).toBeGreaterThan(sequences[i - 1]!);
    }
    // History bleibt auf die konfigurierte Kapazität begrenzt, nextSequence
    // ist trotzdem weit darüber hinaus gewachsen.
    expect(world.events.history.length).toBeLessThanOrEqual(2);
    expect(world.events.nextSequence).toBeGreaterThan(2);
  });

  it('Events landen in Emissionsreihenfolge in der History', () => {
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.run(20);
    const events = engine.getWorld().events.history.toArray();
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.sequence).toBeGreaterThan(events[i - 1]!.sequence);
    }
  });
});
