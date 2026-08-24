import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { load } from '../../src/persistence/load.js';
import { ValidationError } from '../../src/domain/errors.js';
import { makeTestConfig } from '../helpers/testConfig.js';
import { MemoryRawStorage } from '../helpers/MemoryRawStorage.js';

// Persistenz A1 (Subtask 15-17/ADR-A1-05, V2-A1-I1/I3/I4/I5): friendIds muss
// den Save/Load-Zyklus verlustfrei überstehen; Referenzintegrität,
// Selbstreferenz-, Duplikat- und Animal-Ausschlussregeln müssen beim Laden
// durchgesetzt werden. schemaVersion-bezogene Tests liegen in
// persistence-v2.test.ts (dort bereits um schemaVersion 3 erweitert).

describe('Persistenz A1 — Rundreise von friendIds (19.11)', () => {
  it('friendIds überstehen Save -> Load unverändert und reziprok', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    const world = engine.getWorld();
    const [a, b] = world.entities.alive;

    world.components.relationships.get(a!)!.friendIds = [b!];
    world.components.relationships.get(b!)!.friendIds = [a!];

    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const { world: loaded } = load('/save.json', storage);

    expect(loaded.components.relationships.get(a!)!.friendIds).toEqual([b]);
    expect(loaded.components.relationships.get(b!)!.friendIds).toEqual([a]);
  });

  it('friendIds bleiben auch nach Save/Load/Weiterlauf strukturell korrekt', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    const world = engine.getWorld();
    const [a, b] = world.entities.alive;
    world.components.relationships.get(a!)!.friendIds = [b!];
    world.components.relationships.get(b!)!.friendIds = [a!];

    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const resumed = SimulationEngine.loadFrom('/save.json', storage, new ConsoleLogger('error'));
    resumed.run(10);

    const resumedWorld = resumed.getWorld();
    if (resumedWorld.entities.alive.includes(a!) && resumedWorld.entities.alive.includes(b!)) {
      expect(resumedWorld.components.relationships.get(a!)!.friendIds).toContain(b);
      expect(resumedWorld.components.relationships.get(b!)!.friendIds).toContain(a);
    }
  });
});

describe('Persistenz A1 — Validierung (19.13, V2-A1-I1/I3/I4/I5/I2)', () => {
  it('lehnt eine unplausible friendId (>= nextEntityId) ab', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    raw.world.components.relationships[0][1].friendIds = [999999];
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(ValidationError);
  });

  it('lehnt eine Selbstreferenz in friendIds ab (V2-A1-I3)', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    const [entityId] = raw.world.components.relationships[0];
    raw.world.components.relationships[0][1].friendIds = [entityId];
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(ValidationError);
  });

  it('lehnt ein Duplikat in friendIds ab (V2-A1-I4)', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    const otherEntityId = raw.world.components.relationships[1][0];
    raw.world.components.relationships[0][1].friendIds = [otherEntityId, otherEntityId];
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(ValidationError);
  });

  it('lehnt eine gesetzte friendIds-Freundschaft für ein Animal ab (V2-A1-I5)', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    const animalEntry = raw.world.components.identity.find((entry: [number, { kind: string }]) => entry[1].kind === 'animal');
    const personEntry = raw.world.components.identity.find((entry: [number, { kind: string }]) => entry[1].kind === 'person');
    const animalRelationships = raw.world.components.relationships.find((entry: [number, unknown]) => entry[0] === animalEntry[0]);
    animalRelationships[1].friendIds = [personEntry[0]];
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(ValidationError);
  });

  it('lehnt eine nicht-reziproke Freundschaft zwischen zwei lebenden Entities ab (V2-A1-I2)', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    const otherEntityId = raw.world.components.relationships[1][0];
    // A -> B gesetzt, aber B -> A absichtlich NICHT gesetzt, beide lebend.
    raw.world.components.relationships[0][1].friendIds = [otherEntityId];
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(ValidationError);
  });

  it('erlaubt eine plausible, nicht-reziproke friendId, deren Gegenpartei (eine Person) tot ist (kein kaskadierendes Bereinigen)', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    const personEntries = raw.world.components.identity.filter((entry: [number, { kind: string }]) => entry[1].kind === 'person');
    const firstEntityId: number = personEntries[0][0];
    const deadButPlausiblePersonId: number = personEntries[1][0];
    // Referenz auf eine plausible, aber nicht (mehr) lebende Person (nicht
    // in entities.alive) — analog zur bestehenden partnerId/parentIds-Regel.
    raw.world.entities.alive = raw.world.entities.alive.filter((id: number) => id !== deadButPlausiblePersonId);
    raw.world.components.relationships.find((e: [number, unknown]) => e[0] === firstEntityId)[1].friendIds = [deadButPlausiblePersonId];
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).not.toThrow();
  });
});
