import { describe, it, expect } from 'vitest';
import { runPopulationSystem } from '../../src/simulation/systems/PopulationSystem.js';
import { runCleanupSystem } from '../../src/simulation/systems/CleanupSystem.js';
import { markForRemoval } from '../../src/world/EntityRegistry.js';
import { buildTestWorld, addPerson, buildTestContext } from '../helpers/testWorld.js';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { makeTestConfig } from '../helpers/testConfig.js';
import { MemoryRawStorage } from '../helpers/MemoryRawStorage.js';
import { asLocationId, type EntityId } from '../../src/domain/value-objects/ids.js';
import type { WorldState } from '../../src/world/WorldState.js';

// Partnerschaft (v2, Subtask 9 §5/ADR-V2-02, V2-I2/V2-I2b, präzisiert Subtask
// 12 E1/Variante C): einzelnes, optionales partnerId-Feld, Monogamie,
// priorisiert (nicht erzwungen) für die Paarbildung. Läuft über
// runPopulationSystem (nicht die private buildPairs/formPartnership) — das
// ist die einzige exportierte Schnittstelle.
//
// V2-I2 ist eine STANDING-Invariante: für jede lebende Person A mit
// A.partnerId===B muss B leben und B.partnerId===A gelten — unabhängig von
// Ort oder aktueller Reproduktions-Eligibilität. assertPartnershipInvariant()
// prüft dies für die gesamte lebende Population, nicht nur für ein einzelnes
// frisch gebildetes Paar.
function assertPartnershipInvariant(world: WorldState): void {
  for (const id of world.entities.alive) {
    const partnerId = world.components.relationships.get(id)?.partnerId;
    if (partnerId === undefined) continue;
    expect(world.entities.alive.includes(partnerId)).toBe(true);
    expect(world.components.relationships.get(partnerId)?.partnerId).toBe(id);
  }
}

function ctxFor(world: ReturnType<typeof buildTestWorld>, overrides?: { crisisThreshold?: number }) {
  return buildTestContext(world, {
    reproduction: { minAdultAgeTicks: 0, birthProbabilityPerEligiblePair: 1, crisisThreshold: overrides?.crisisThreshold ?? 30 },
  });
}

describe('Fall 1 — normale Paarbildung (V2-I2: atomar, wechselseitig)', () => {
  it('zwei unverpartnerte eligible Personen am selben Ort erhalten nach einer Geburt reziproke partnerId', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const b = addPerson(world, { locationId: asLocationId(1) });
    const ctx = ctxFor(world);

    runPopulationSystem(world, ctx);

    expect(world.components.relationships.get(a)!.partnerId).toBe(b);
    expect(world.components.relationships.get(b)!.partnerId).toBe(a);
    assertPartnershipInvariant(world);
  });

  it('emittiert ein BirthEvent mit beiden Elternteilen', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const b = addPerson(world, { locationId: asLocationId(1) });
    const ctx = ctxFor(world);

    runPopulationSystem(world, ctx);

    const birth = world.events.pending.find((e) => e.type === 'BirthEvent');
    expect(birth).toBeDefined();
    expect(birth?.type === 'BirthEvent' && [...birth.parentIds].sort()).toEqual([a, b].sort());
  });

  it('paart eine bestehende Partnerschaft auch dann, wenn eine niedrigere EntityId sonst zuerst gepaart würde', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) }); // niedrigste EntityId, unverpartnert
    const b = addPerson(world, { locationId: asLocationId(1) });
    const c = addPerson(world, { locationId: asLocationId(1) });
    world.components.relationships.get(b)!.partnerId = c;
    world.components.relationships.get(c)!.partnerId = b;
    const ctx = ctxFor(world);

    runPopulationSystem(world, ctx);

    expect(world.components.relationships.get(b)!.partnerId).toBe(c);
    expect(world.components.relationships.get(c)!.partnerId).toBe(b);
    expect(world.components.relationships.get(a)!.partnerId).toBeUndefined();
    assertPartnershipInvariant(world);

    const births = world.events.pending.filter((e) => e.type === 'BirthEvent');
    expect(births).toHaveLength(1);
    expect(births[0]?.type === 'BirthEvent' && [...births[0].parentIds].sort()).toEqual([b, c].sort());
  });
});

describe('Fall 2 — Partner stirbt (V2-I2b: Wiederverpartnerung nach echtem Tod)', () => {
  it('nach tatsächlicher Entfernung des Partners (CleanupSystem) kann sich die verwitwete Person neu verpartnern', () => {
    const world = buildTestWorld();
    const widowed = addPerson(world, { locationId: asLocationId(1) });
    const doomed = addPerson(world, { locationId: asLocationId(1) });
    world.components.relationships.get(widowed)!.partnerId = doomed;
    world.components.relationships.get(doomed)!.partnerId = widowed;

    markForRemoval(world, doomed);
    runCleanupSystem(world);
    expect(world.entities.alive.includes(doomed)).toBe(false);
    // partnerId bleibt bewusst auf die verstorbene Entity zeigen (kein
    // kaskadierendes Bereinigen, konsistent mit 03 §15/V2-I1).
    expect(world.components.relationships.get(widowed)!.partnerId).toBe(doomed);

    const newPartner = addPerson(world, { locationId: asLocationId(1) });
    const ctx = ctxFor(world);
    runPopulationSystem(world, ctx);

    expect(world.components.relationships.get(widowed)!.partnerId).toBe(newPartner);
    expect(world.components.relationships.get(newPartner)!.partnerId).toBe(widowed);
    assertPartnershipInvariant(world);
  });

  it('eine plausible, aber nicht mehr lebende partnerId (Fixture-Fall) erlaubt ebenfalls Wiederverpartnerung', () => {
    const world = buildTestWorld();
    const widowed = addPerson(world, { locationId: asLocationId(1) });
    const newPartner = addPerson(world, { locationId: asLocationId(1) });
    const deadPartnerId = 999 as EntityId;
    world.components.relationships.get(widowed)!.partnerId = deadPartnerId;
    const ctx = ctxFor(world);

    runPopulationSystem(world, ctx);

    expect(world.components.relationships.get(widowed)!.partnerId).toBe(newPartner);
    expect(world.components.relationships.get(newPartner)!.partnerId).toBe(widowed);
    assertPartnershipInvariant(world);
  });
});

describe('Fall 3/5/6 — Partner an anderem Ort (Subtask 11 Kategorie-A-Befund, jetzt behoben)', () => {
  it('eine bestehende, lebende Partnerschaft wird NICHT durch eine lokal verfügbare dritte Person ersetzt, wenn der Partner an einem anderen Ort ist', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const c = addPerson(world, { locationId: asLocationId(1) }); // lokal verfügbare Drittperson
    const b = addPerson(world, { locationId: asLocationId(2) }); // lebender Partner, anderer Ort
    world.components.relationships.get(a)!.partnerId = b;
    world.components.relationships.get(b)!.partnerId = a;
    const ctx = ctxFor(world);

    runPopulationSystem(world, ctx);

    // Exakter, vormals fehlschlagender Fall: A.partnerId muss B bleiben,
    // B.partnerId muss A bleiben, C darf nicht "einspringen".
    expect(world.components.relationships.get(a)!.partnerId).toBe(b);
    expect(world.components.relationships.get(b)!.partnerId).toBe(a);
    expect(world.components.relationships.get(c)!.partnerId).toBeUndefined();
    assertPartnershipInvariant(world);

    // Keine Fortpflanzung an diesem Tick, da weder A<->B (nicht co-lokal) noch
    // A<->C (A ist reserviert) noch B<->irgendjemand (B allein an Ort 2) ein
    // gültiges Paar bilden.
    expect(world.events.pending.some((e) => e.type === 'BirthEvent')).toBe(false);
  });
});

describe('Fall 4 — Partner temporär nicht reproduktions-eligibel (Krisenschwelle)', () => {
  it('eine bestehende, lebende Partnerschaft wird NICHT ersetzt, wenn der Partner co-lokal, aber unterhalb der Krisenschwelle ist', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const c = addPerson(world, { locationId: asLocationId(1) });
    const b = addPerson(world, { locationId: asLocationId(1), needs: { hunger: 10, energy: 100, social: 100 } }); // co-lokal, aber unter crisisThreshold
    world.components.relationships.get(a)!.partnerId = b;
    world.components.relationships.get(b)!.partnerId = a;
    const ctx = ctxFor(world, { crisisThreshold: 30 });

    runPopulationSystem(world, ctx);

    expect(world.components.relationships.get(a)!.partnerId).toBe(b);
    expect(world.components.relationships.get(b)!.partnerId).toBe(a);
    expect(world.components.relationships.get(c)!.partnerId).toBeUndefined();
    assertPartnershipInvariant(world);
  });
});

describe('Standing-Invariante V2-I2 über mehrere Ticks mit Ortswechsel und wiederholter Fortpflanzung (Subtask 12)', () => {
  it('bleibt über einen mehrtickigen Lauf mit Reisen und mehreren Geburten durchgehend erfüllt', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1), ticksAlive: 10 });
    const b = addPerson(world, { locationId: asLocationId(1), ticksAlive: 10 });
    const c = addPerson(world, { locationId: asLocationId(1), ticksAlive: 10 });
    const d = addPerson(world, { locationId: asLocationId(2), ticksAlive: 10 });
    // minAdultAgeTicks > 0 (statt ctxFor()-Default 0): verhindert, dass ein in
    // Tick 1 geborenes Kind (ticksAlive:0) durch ADR-V2-06-unabhängiges
    // Alterungsverhalten bereits in Tick 2 selbst als Elternteil eligibel wird
    // und die C/D-Zuordnung dieses Tests verfälscht — reiner Testfixture-
    // Parameter, keine Produktänderung (analog Subtask 10 OOM-Fix).
    const ctx = buildTestContext(world, {
      reproduction: { minAdultAgeTicks: 10, birthProbabilityPerEligiblePair: 1, crisisThreshold: 30 },
    });

    // Tick 1: A/B am selben Ort, unverpartnert -> werden Partner. C bleibt
    // allein übrig (ungerade Anzahl an Ort 1), D allein an Ort 2.
    runPopulationSystem(world, ctx);
    assertPartnershipInvariant(world);
    expect(world.components.relationships.get(a)!.partnerId).toBe(b);
    expect(world.components.relationships.get(c)!.partnerId).toBeUndefined();

    // Tick 2: B "reist" nach Ort 2 (simulierter Ortswechsel zwischen Ticks).
    // A bleibt mit C am selben Ort zurück - C darf NICHT einspringen.
    world.components.position.set(b, { locationId: asLocationId(2) });
    runPopulationSystem(world, ctx);
    assertPartnershipInvariant(world);
    expect(world.components.relationships.get(a)!.partnerId).toBe(b);
    expect(world.components.relationships.get(c)!.partnerId).toBeUndefined();
    expect(world.components.relationships.get(d)!.partnerId).toBeUndefined(); // B ist für D nicht verfügbar (reserviert)

    // Tick 3: B reist zurück zu Ort 1 - A/B reproduzieren erneut (bestehende
    // Partnerschaft, nicht neu gebildet), C bleibt weiterhin unverpartnert.
    world.components.position.set(b, { locationId: asLocationId(1) });
    runPopulationSystem(world, ctx);
    assertPartnershipInvariant(world);
    expect(world.components.relationships.get(a)!.partnerId).toBe(b);
    expect(world.components.relationships.get(b)!.partnerId).toBe(a);
    expect(world.components.relationships.get(c)!.partnerId).toBeUndefined();

    const births = world.events.pending.filter((e) => e.type === 'BirthEvent');
    expect(births.length).toBeGreaterThanOrEqual(2); // Tick 1 und Tick 3, nicht Tick 2
  });
});

describe('Fall 7 — Save/Load erhält die Partnerschaftssemantik unverändert', () => {
  it('partnerId ist vor und nach Save/Load reziprok identisch', () => {
    const storage = new MemoryRawStorage();
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    const world = engine.getWorld();
    const [personA, personB] = world.entities.alive;
    world.components.relationships.get(personA!)!.partnerId = personB!;
    world.components.relationships.get(personB!)!.partnerId = personA!;

    engine.save('/partnership.json', storage, '2026-01-01T00:00:00.000Z');
    const loaded = SimulationEngine.loadFrom('/partnership.json', storage, new ConsoleLogger('error'));
    const loadedWorld = loaded.getWorld();

    expect(loadedWorld.components.relationships.get(personA!)!.partnerId).toBe(personB);
    expect(loadedWorld.components.relationships.get(personB!)!.partnerId).toBe(personA);
    assertPartnershipInvariant(loadedWorld);
  });
});
