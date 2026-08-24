import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { save } from '../../src/persistence/save.js';
import { load } from '../../src/persistence/load.js';
import { PersistenceError, ValidationError } from '../../src/domain/errors.js';
import { makeTestConfig } from '../helpers/testConfig.js';
import { MemoryRawStorage } from '../helpers/MemoryRawStorage.js';

describe('Persistenz (Subtask 2 §13, Subtask 2 §20 Persistenzfluss)', () => {
  it('speichert und lädt einen vollständigen WorldState verlustfrei', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.run(15);
    const worldBefore = engine.getWorld();

    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const { world: worldAfter } = load('/save.json', storage);

    expect(worldAfter.clock.currentTick).toBe(worldBefore.clock.currentTick);
    expect(worldAfter.entities.alive).toEqual(worldBefore.entities.alive);
    expect(worldAfter.rng.masterSeed).toBe(worldBefore.rng.masterSeed);
    expect(worldAfter.rng.streamStates).toEqual(worldBefore.rng.streamStates);
    expect(worldAfter.events.nextSequence).toBe(worldBefore.events.nextSequence);
    for (const id of worldBefore.entities.alive) {
      expect(worldAfter.components.needs.get(id)).toEqual(worldBefore.components.needs.get(id));
      expect(worldAfter.components.position.get(id)).toEqual(worldBefore.components.position.get(id));
    }
  });

  it('lehnt fehlende Dateien mit PersistenceError ab', () => {
    const storage = new MemoryRawStorage();
    expect(() => load('/does-not-exist.json', storage)).toThrow(PersistenceError);
  });

  it('lehnt ungültiges JSON mit PersistenceError ab', () => {
    const storage = new MemoryRawStorage();
    storage.setRaw('/broken.json', '{not valid json');
    expect(() => load('/broken.json', storage)).toThrow(PersistenceError);
  });

  it('lehnt strukturell ungültige Savegames mit ValidationError ab', () => {
    const storage = new MemoryRawStorage();
    storage.setRaw('/invalid.json', JSON.stringify({ schemaVersion: 1 }));
    expect(() => load('/invalid.json', storage)).toThrow(ValidationError);
  });

  it('lehnt schemaVersion-Mismatch mit PersistenceError ab', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    raw.schemaVersion = 999;
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(PersistenceError);
  });

  it('lehnt Referenzintegritätsfehler (unbekannte LocationId) mit ValidationError ab', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    raw.world.components.position[0][1].locationId = 999999;
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(ValidationError);
  });

  it('lässt bei fehlgeschlagenem Load keinen Teilzustand entstehen (throws statt partial return)', () => {
    const storage = new MemoryRawStorage();
    storage.setRaw('/broken.json', '{not valid json');
    let world: unknown;
    try {
      const result = load('/broken.json', storage);
      world = result.world;
    } catch {
      // erwartet
    }
    expect(world).toBeUndefined();
  });

  it('save() wirft PersistenceError bei I/O-Fehlern, ohne den laufenden WorldState zu verändern', () => {
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    const failingStorage = {
      read: () => {
        throw new Error('no read needed');
      },
      write: () => {
        throw new Error('disk full');
      },
    };
    const tickBefore = engine.getWorld().clock.currentTick;
    expect(() => engine.save('/x.json', failingStorage, 'now')).toThrow(PersistenceError);
    expect(engine.getWorld().clock.currentTick).toBe(tickBefore);
  });
});
