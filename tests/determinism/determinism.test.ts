import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { serialize } from '../../src/persistence/serialize.js';
import { makeTestConfig } from '../helpers/testConfig.js';
import { MemoryRawStorage } from '../helpers/MemoryRawStorage.js';
import type { PersonNeeds } from '../../src/domain/components/needs.js';

function canonical(engine: SimulationEngine): string {
  const world = engine.getWorld();
  const file = serialize(world, engine.getConfig(), 'test', '2026-01-01T00:00:00.000Z');
  return JSON.stringify(file);
}

// snapshot() statt canonical(): liefert das SaveFile-Objekt selbst statt eine
// JSON-Zeichenkette. Für Vergleiche, bei denen eine Seite durch zod re-
// parsed wurde (Save/Load-Rundreise), unterscheidet sich sonst nur die
// Schlüsselreihenfolge (zod baut Objekte in Schema-Deklarationsreihenfolge,
// nicht in der ursprünglichen Einfügereihenfolge) — inhaltlich identisch,
// aber als String unterschiedlich. toEqual vergleicht strukturell, nicht
// über die Zeichenkette, und ist daher hier das richtige Werkzeug.
function snapshot(engine: SimulationEngine): unknown {
  return serialize(engine.getWorld(), engine.getConfig(), 'test', '2026-01-01T00:00:00.000Z');
}

describe('Determinismus (Subtask 1 §5.4, Subtask 2 §19)', () => {
  it('Test 1: gleicher Seed + Config, zwei unabhängige Engines, N Ticks -> identischer WorldState', () => {
    const config = makeTestConfig();
    const engineA = SimulationEngine.create(config, new ConsoleLogger('error'));
    const engineB = SimulationEngine.create(config, new ConsoleLogger('error'));
    engineA.run(50);
    engineB.run(50);
    expect(canonical(engineA)).toBe(canonical(engineB));
  });

  it('Test 2: gleicher Seed + Config, zwei Läufe -> identische EventHistory-Sequenz', () => {
    const config = makeTestConfig();
    const engineA = SimulationEngine.create(config, new ConsoleLogger('error'));
    const engineB = SimulationEngine.create(config, new ConsoleLogger('error'));
    engineA.run(50);
    engineB.run(50);
    expect(engineA.getWorld().events.history.toArray()).toEqual(engineB.getWorld().events.history.toArray());
  });

  it('Test 3: Speichern bei Tick N, Laden, Weiterlaufen bis N+M === direkter Lauf bis N+M', () => {
    const config = makeTestConfig();
    const storage = new MemoryRawStorage();

    const direct = SimulationEngine.create(config, new ConsoleLogger('error'));
    direct.run(80);

    const interrupted = SimulationEngine.create(config, new ConsoleLogger('error'));
    interrupted.run(50);
    interrupted.save('/mid.json', storage, '2026-01-01T00:00:00.000Z');
    const resumed = SimulationEngine.loadFrom('/mid.json', storage, new ConsoleLogger('error'));
    resumed.run(30);

    expect(snapshot(resumed)).toEqual(snapshot(direct));
  });

  it('unterschiedliche Seeds erzeugen (mit sehr hoher Wahrscheinlichkeit) unterschiedliche Verläufe', () => {
    const engineA = SimulationEngine.create(makeTestConfig({ seed: 1 }), new ConsoleLogger('error'));
    const engineB = SimulationEngine.create(makeTestConfig({ seed: 2 }), new ConsoleLogger('error'));
    engineA.run(50);
    engineB.run(50);
    expect(canonical(engineA)).not.toBe(canonical(engineB));
  });
});

// v2, Subtask 10 §23: Determinismus muss auch mit aktiven v2-Merkmalen
// (Rollen, SupplyDemand-Markt, Care, MaintenanceSystem — kein neuer
// RNG-Substream nach ADR-V2-07) unverändert gelten.
function makeV2Config() {
  return makeTestConfig({
    initialPopulation: { humans: 4, animals: 2, roles: { farmers: 2, lumberjacks: 2 } },
    economy: {
      marketExchangeRatio: 1,
      productionBaseRate: { Food: 20, Wood: 20 },
      market: 'SupplyDemand',
      supplyDemand: { elasticity: 0.5, minRatio: 0.5, maxRatio: 4 },
    },
  });
}

describe('Determinismus v2 (Subtask 10 §23)', () => {
  it('gleicher Seed + v2-Config (Rollen, SupplyDemand, Care, Maintenance), zwei unabhängige Engines -> identischer WorldState', () => {
    const config = makeV2Config();
    const engineA = SimulationEngine.create(config, new ConsoleLogger('error'));
    const engineB = SimulationEngine.create(config, new ConsoleLogger('error'));
    engineA.run(50);
    engineB.run(50);
    expect(canonical(engineA)).toBe(canonical(engineB));
  });

  it('Speichern/Laden/Fortsetzen mit aktiven v2-Merkmalen bleibt deterministisch', () => {
    const config = makeV2Config();
    const storage = new MemoryRawStorage();

    const direct = SimulationEngine.create(config, new ConsoleLogger('error'));
    direct.run(80);

    const interrupted = SimulationEngine.create(config, new ConsoleLogger('error'));
    interrupted.run(50);
    interrupted.save('/v2-mid.json', storage, '2026-01-01T00:00:00.000Z');
    const resumed = SimulationEngine.loadFrom('/v2-mid.json', storage, new ConsoleLogger('error'));
    resumed.run(30);

    expect(snapshot(resumed)).toEqual(snapshot(direct));
  });
});

// A1, Subtask 15-17 (ADR-A1-02): Determinismus muss auch mit aktiver
// Freundschaftsbildung (SocialBondingSystem, kein RNG) unverändert gelten.
// Reproduktion ist für diese Tests irrelevant (geprüft wird Freundschafts-
// determinismus, nicht Populationsdynamik) und wird deaktiviert: die
// Default-Reproduktionsparameter von makeTestConfig() kombiniert mit
// ADR-V2-06 (Startpopulation bereits erwachsen) führen bei 80 Ticks zu
// exponentiellem Populationswachstum (empirisch bestätigt, s. Subtask 10) —
// eine Eigenschaft dieser Testfixture-Parameter, kein A1-Befund.
function makeA1Config() {
  const base = makeTestConfig({ initialPopulation: { humans: 4, animals: 2 } });
  return { ...base, reproduction: { ...base.reproduction, birthProbabilityPerEligiblePair: 0 } };
}

// Zwingt alle Personen deterministisch dazu, Socialize zu wählen (niedriges
// social, volles hunger/energy), damit SocialBondingSystem etwas zu
// erkennen hat — identische Bedürfnismanipulation auf beiden Seiten des
// Vergleichs, daher kein Determinismusrisiko.
function forceLowSocial(engine: SimulationEngine): void {
  for (const id of engine.getWorld().entities.alive) {
    const needs = engine.getWorld().components.needs.get(id);
    if (needs && 'social' in needs) {
      (needs as PersonNeeds).social = 0;
      (needs as PersonNeeds).hunger = 100;
      (needs as PersonNeeds).energy = 100;
    }
  }
}

describe('Determinismus A1 (Subtask 17)', () => {
  it('gleicher Seed + Config, zwei unabhängige Engines mit aktiver Freundschaftsbildung -> identischer WorldState inkl. friendIds', () => {
    const config = makeA1Config();
    const engineA = SimulationEngine.create(config, new ConsoleLogger('error'));
    const engineB = SimulationEngine.create(config, new ConsoleLogger('error'));
    forceLowSocial(engineA);
    forceLowSocial(engineB);
    engineA.run(50);
    engineB.run(50);
    expect(canonical(engineA)).toBe(canonical(engineB));

    const friendCountA = [...engineA.getWorld().components.relationships.values()].reduce((sum, r) => sum + r.friendIds.length, 0);
    expect(friendCountA).toBeGreaterThan(0); // Testsanity: die Manipulation erzeugt tatsächlich Freundschaften
  });

  it('Speichern/Laden/Fortsetzen mit aktiver Freundschaftsbildung bleibt deterministisch', () => {
    const config = makeA1Config();
    const storage = new MemoryRawStorage();

    const direct = SimulationEngine.create(config, new ConsoleLogger('error'));
    forceLowSocial(direct);
    direct.run(80);

    const interrupted = SimulationEngine.create(config, new ConsoleLogger('error'));
    forceLowSocial(interrupted);
    interrupted.run(50);
    interrupted.save('/a1-mid.json', storage, '2026-01-01T00:00:00.000Z');
    const resumed = SimulationEngine.loadFrom('/a1-mid.json', storage, new ConsoleLogger('error'));
    resumed.run(30);

    expect(snapshot(resumed)).toEqual(snapshot(direct));
  });
});
