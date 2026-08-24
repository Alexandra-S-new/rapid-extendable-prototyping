import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { load } from '../../src/persistence/load.js';
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/schema.js';
import { ValidationError } from '../../src/domain/errors.js';
import { makeTestConfig } from '../helpers/testConfig.js';
import { MemoryRawStorage } from '../helpers/MemoryRawStorage.js';

// Persistenz v2 (Subtask 9 §15/ADR-V2-09, V2-I9 "Persistenzvollständigkeit"):
// die drei neuen v2-Felder (partnerId, role, condition) + das neue
// BuildingConditionChangedEvent müssen den Save/Load-Zyklus verlustfrei
// überstehen; schemaVersion war auf 2 gebumpt, ohne Migrationspfad (ADR-10).
// A1 (Subtask 15-17/ADR-A1-05) hat schemaVersion auf 3 weitergebumpt
// (zusätzliches Feld friendIds) — die Version selbst wird hier nur noch als
// aktuelle, nicht mehr als v2-spezifische Zahl verifiziert.

describe('Persistenz v2 — Rundreise der neuen Felder', () => {
  it('partnerId, role und Building.condition überstehen Save/Load unverändert', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    const world = engine.getWorld();
    const [personA, personB] = world.entities.alive;

    world.components.relationships.get(personA!)!.partnerId = personB!;
    world.components.relationships.get(personB!)!.partnerId = personA!;
    const identityA = world.components.identity.get(personA!)!;
    world.components.identity.set(personA!, { ...identityA, role: 'Farmer' });
    const field = world.environment.buildings.find((b) => b.kind === 'Field')!;
    field.condition = 42;

    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const { world: loaded } = load('/save.json', storage);

    expect(loaded.components.relationships.get(personA!)!.partnerId).toBe(personB);
    expect(loaded.components.relationships.get(personB!)!.partnerId).toBe(personA);
    expect(loaded.components.identity.get(personA!)!.role).toBe('Farmer');
    expect(loaded.environment.buildings.find((b) => b.kind === 'Field')!.condition).toBe(42);
  });

  it('speichert mit schemaVersion 3', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    expect(raw.schemaVersion).toBe(3);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
  });

  it('ein Savegame mit schemaVersion 1 (v1-Baseline) wird ohne Migration abgelehnt (ADR-10)', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    raw.schemaVersion = 1;
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(/schemaVersion/);
  });

  it('ein Savegame mit schemaVersion 2 (v2-Baseline, ohne friendIds) wird ohne Migration abgelehnt (ADR-10/ADR-A1-05)', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    raw.schemaVersion = 2;
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(/schemaVersion/);
  });
});

describe('Persistenz v2 — Referenzintegrität (V2-I1: partnerId)', () => {
  it('lehnt eine unplausible partnerId (>= nextEntityId) mit ValidationError ab', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    raw.world.components.relationships[0][1].partnerId = 999999;
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(ValidationError);
  });

  it('prüft partnerId nur auf Plausibilität, nicht auf Reziprozität (analog zur v1-Regel für parentIds/childIds)', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    // Plausibel (< nextEntityId, existierende lebendige Entity), aber ohne
    // reziproken Gegeneintrag — deserialize prüft laut Kommentar in
    // persistence/deserialize.ts explizit nur Plausibilität, nicht
    // Lebendigkeit/Reziprozität (03 §15, für v2 auf partnerId übertragen).
    raw.world.components.relationships[0][1].partnerId = raw.world.components.relationships[1][0];
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).not.toThrow();
  });
});

describe('Persistenz v2 — Building.condition-Präsenzregel (V2-I5)', () => {
  it('lehnt ein Field ohne condition ab', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    const field = raw.world.environment.buildings.find((b: { kind: string }) => b.kind === 'Field');
    delete field.condition;
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(ValidationError);
  });

  it('lehnt ein Market mit gesetzter condition ab', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    engine.save('/save.json', storage, '2026-01-01T00:00:00.000Z');
    const raw = JSON.parse(storage.read('/save.json'));
    const market = raw.world.environment.buildings.find((b: { kind: string }) => b.kind === 'Market');
    market.condition = 50;
    storage.setRaw('/save.json', JSON.stringify(raw));
    expect(() => load('/save.json', storage)).toThrow(ValidationError);
  });
});
