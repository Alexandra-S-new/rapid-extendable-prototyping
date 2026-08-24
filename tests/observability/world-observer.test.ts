import { describe, it, expect } from 'vitest';
import { WorldObserver } from '../../src/observability/WorldObserver.js';
import { toWorldStateReader } from '../../src/world/WorldState.js';
import { defaultConfig } from '../../src/config/defaults.js';
import { asLocationId } from '../../src/domain/value-objects/ids.js';
import { buildTestWorld, addPerson, addAnimal, makeTestBuilding } from '../helpers/testWorld.js';
import { makeTestConfig } from '../helpers/testConfig.js';
import type { SimulationConfig } from '../../src/config/schema.js';

// WorldObserver (Subtask 20, gemäß Subtask 19 §32.5): Unit-Tests für die
// Observation Layer — Feldkorrektheit, Deep-Copy-/Mutabilitäts-Sicherheit,
// Person-/Tier-/Ort-Beobachtung, unbekannte Entities, O(n)-Performance.
//
// addPerson/addAnimal (tests/helpers/testWorld.ts) rufen intern bereits
// createEntity() auf, das die Entity automatisch sortiert in
// world.entities.alive einfügt (world/EntityRegistry.ts) — hier daher
// bewusst KEIN zusätzliches world.entities.alive.push(...).

function makeConfig(overrides?: Partial<SimulationConfig>): SimulationConfig {
  return { ...defaultConfig, ...overrides };
}

describe('WorldObserver — Personen-Beobachtung', () => {
  it('liefert alle dokumentierten Felder für eine lebende Person', () => {
    const world = buildTestWorld();
    const locationId = asLocationId(1);
    const personId = addPerson(world, { locationId, needs: { hunger: 42, energy: 55, social: 10 }, ticksAlive: 20 });
    world.components.identity.set(personId, { kind: 'person', displayName: 'Alex', role: 'Farmer' });

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const observation = observer.getPersonObservation(personId);

    expect(observation).toBeDefined();
    expect(observation!.id).toBe(personId);
    expect(observation!.kind).toBe('person');
    expect(observation!.displayName).toBe('Alex');
    expect(observation!.role).toBe('Farmer');
    expect(observation!.ageTicks).toBe(20);
    expect(observation!.locationId).toBe(locationId);
    expect(observation!.needs).toEqual({ hunger: 42, energy: 55, social: 10 });
    expect(observation!.currentActivity).toEqual({ kind: 'Idle' });
    expect(observation!.partnerId).toBeUndefined();
    expect(observation!.friendIds).toEqual([]);
    expect(observation!.parentIds).toEqual([]);
    expect(observation!.childIds).toEqual([]);
  });

  it('leitet lifeStage konsistent mit deriveLifeStage/minAdultAgeTicks ab', () => {
    const world = buildTestWorld();
    const child = addPerson(world, { ticksAlive: 5 });
    const adult = addPerson(world, { ticksAlive: 999 });

    const observer = new WorldObserver(
      toWorldStateReader(world),
      makeConfig({ reproduction: { ...defaultConfig.reproduction, minAdultAgeTicks: 10 } }),
    );

    expect(observer.getPersonObservation(child)!.lifeStage).toBe('child');
    expect(observer.getPersonObservation(adult)!.lifeStage).toBe('adult');
  });

  it('bildet partnerId und friendIds korrekt ab', () => {
    const world = buildTestWorld();
    const a = addPerson(world);
    const b = addPerson(world);
    world.components.relationships.set(a, { parentIds: [], childIds: [], friendIds: [b], partnerId: b });
    world.components.relationships.set(b, { parentIds: [], childIds: [], friendIds: [a], partnerId: a });

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const observationA = observer.getPersonObservation(a)!;

    expect(observationA.partnerId).toBe(b);
    expect(observationA.friendIds).toEqual([b]);
  });

  it('liefert undefined für eine unbekannte Entity-ID', () => {
    const world = buildTestWorld();
    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    expect(observer.getPersonObservation(999999 as never)).toBeUndefined();
  });

  it('liefert undefined, wenn getPersonObservation mit der ID eines Tiers aufgerufen wird', () => {
    const world = buildTestWorld();
    const animalId = addAnimal(world);
    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    expect(observer.getPersonObservation(animalId)).toBeUndefined();
  });

  it('bildet Traveling-Aktivitäten korrekt ab (nur kind + fachlich relevante Felder)', () => {
    const world = buildTestWorld();
    const personId = addPerson(world);
    world.components.aiState.set(personId, {
      currentActivity: {
        kind: 'Traveling',
        destination: asLocationId(2),
        path: [asLocationId(1), asLocationId(2)],
        nextHopIndex: 0,
        ticksRemainingInHop: 2,
      },
    });

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const observation = observer.getPersonObservation(personId)!;

    expect(observation.currentActivity).toEqual({ kind: 'Traveling', destination: asLocationId(2) });
    expect((observation.currentActivity as { path?: unknown }).path).toBeUndefined();
  });

  it('bildet Performing-Aktivitäten korrekt ab', () => {
    const world = buildTestWorld();
    const personId = addPerson(world);
    world.components.aiState.set(personId, {
      currentActivity: { kind: 'Performing', actionId: 'Eat' as never, ticksInAction: 3 },
    });

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const observation = observer.getPersonObservation(personId)!;

    expect(observation.currentActivity).toEqual({ kind: 'Performing', actionId: 'Eat', ticksInAction: 3 });
  });
});

describe('WorldObserver — Tier-Beobachtung', () => {
  it('liefert kein social-Bedürfnis und keine partnerId/friendIds für Tiere', () => {
    const world = buildTestWorld();
    const animalId = addAnimal(world, { needs: { hunger: 30, energy: 40 } });
    world.components.identity.set(animalId, { kind: 'animal', displayName: 'Animal', species: 'Rabbit' });

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const observation = observer.getAnimalObservation(animalId)!;

    expect(observation.kind).toBe('animal');
    expect(observation.species).toBe('Rabbit');
    expect(observation.needs).toEqual({ hunger: 30, energy: 40 });
    expect('social' in observation.needs).toBe(false);
    expect((observation as unknown as { partnerId?: unknown }).partnerId).toBeUndefined();
    expect((observation as unknown as { friendIds?: unknown }).friendIds).toBeUndefined();
  });

  it('liefert undefined, wenn getAnimalObservation mit der ID einer Person aufgerufen wird', () => {
    const world = buildTestWorld();
    const personId = addPerson(world);
    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    expect(observer.getAnimalObservation(personId)).toBeUndefined();
  });
});

describe('WorldObserver — Ort-Beobachtung', () => {
  it('zählt Personen/Tiere pro Ort korrekt und ordnet Gebäude dem richtigen Ort zu', () => {
    const locationA = asLocationId(1);
    const locationB = asLocationId(2);
    const buildings = [makeTestBuilding(1, 'Field', 1, 10), makeTestBuilding(2, 'Market', 2)];
    const world = buildTestWorld({
      locations: [
        { id: locationA, name: 'Dorf A', connections: [], buildingIds: [buildings[0]!.id] },
        { id: locationB, name: 'Dorf B', connections: [], buildingIds: [buildings[1]!.id] },
      ],
      buildings,
    });
    addPerson(world, { locationId: locationA });
    addPerson(world, { locationId: locationA });
    addAnimal(world, { locationId: locationB });
    // v2/ADR-V2-03: Field/Workplace besitzen ein condition-Feld.
    world.environment.buildings[0]!.condition = 77;

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());

    const locationAObs = observer.getLocationObservation(locationA)!;
    expect(locationAObs.name).toBe('Dorf A');
    expect(locationAObs.personCount).toBe(2);
    expect(locationAObs.animalCount).toBe(0);
    expect(locationAObs.buildings).toEqual([{ id: buildings[0]!.id, kind: 'Field', condition: 77 }]);

    const locationBObs = observer.getLocationObservation(locationB)!;
    expect(locationBObs.personCount).toBe(0);
    expect(locationBObs.animalCount).toBe(1);
    expect(locationBObs.buildings).toEqual([{ id: buildings[1]!.id, kind: 'Market' }]);
  });

  it('liefert undefined für eine unbekannte LocationId', () => {
    const world = buildTestWorld();
    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    expect(observer.getLocationObservation(asLocationId(999))).toBeUndefined();
  });
});

describe('WorldObserver — Weltübersicht (getWorldSnapshot)', () => {
  it('enthält tick/season/weather sowie alle lebenden Personen/Tiere/Orte', () => {
    const world = buildTestWorld();
    const p = addPerson(world);
    const a = addAnimal(world);
    world.clock.currentTick = 42;

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const snapshot = observer.getWorldSnapshot();

    expect(snapshot.tick).toBe(42);
    expect(snapshot.season).toBe('Spring');
    expect(snapshot.weather).toBe('Clear');
    expect(snapshot.people.map((x) => x.id)).toEqual([p]);
    expect(snapshot.animals.map((x) => x.id)).toEqual([a]);
    expect(snapshot.locations).toHaveLength(2);
    expect(snapshot.recentEvents).toEqual([]);
  });

  it('gibt Personen/Tiere in der stabilen Reihenfolge von entities.alive zurück (Determinismus, 19 §32.13)', () => {
    const world = buildTestWorld();
    const ids = [addPerson(world), addPerson(world), addPerson(world)];

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const snapshot = observer.getWorldSnapshot();

    expect(snapshot.people.map((p) => p.id)).toEqual(ids);
  });

  it('schließt tote (nicht mehr in entities.alive befindliche) Entities aus', () => {
    const world = buildTestWorld();
    const alive = addPerson(world);
    const dead = addPerson(world);
    // Simuliert eine bereits per CleanupSystem entfernte Entity: nicht mehr
    // in entities.alive, ihre Components (analog commitRemovals) entfernt.
    world.entities.alive.splice(world.entities.alive.indexOf(dead), 1);

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const snapshot = observer.getWorldSnapshot();

    expect(snapshot.people.map((p) => p.id)).toEqual([alive]);
    // Component-Daten sind (wie bei einer echten commitRemovals-Entfernung)
    // noch vorhanden, aber die Entity gilt für die Observation Layer als
    // nicht mehr existent, sobald sie nicht mehr in entities.alive steht.
  });
});

describe('WorldObserver — Ereignisse (getRecentEvents)', () => {
  it('liefert die vorhandene Event-History über das bestehende queryEventHistory-Muster', () => {
    const world = buildTestWorld();
    world.events.history.push({ type: 'SeasonChangedEvent', sequence: 0, tick: 1, season: 'Summer' });
    world.events.history.push({ type: 'WeatherChangedEvent', sequence: 1, tick: 2, weather: 'Rain' });

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const events = observer.getRecentEvents({ last: 1 });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('WeatherChangedEvent');
  });
});

describe('WorldObserver — Deep-Copy-/Mutabilitäts-Sicherheit (Subtask 19 §32.5)', () => {
  it('eine Mutation der zurückgegebenen PersonObservation beeinflusst den live WorldState nicht', () => {
    const world = buildTestWorld();
    const personId = addPerson(world, { needs: { hunger: 50, energy: 50, social: 50 } });
    world.components.relationships.set(personId, { parentIds: [], childIds: [], friendIds: [1 as never], partnerId: undefined });

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const observation = observer.getPersonObservation(personId)!;

    // Mutation der Kopie (kein Cast auf "as any" nötig — die Felder sind
    // strukturell beschreibbar, da nur der Rückgabetyp readonly ist, exakt
    // das in Subtask 19 §32.5 beschriebene Sicherheitsproblem der ALTEN
    // WorldStateReader-Sicht, hier aber an einer echten Kopie geprüft).
    (observation.needs as { hunger: number }).hunger = 0;
    (observation.friendIds as unknown as number[]).push(999);

    const liveNeeds = world.components.needs.get(personId)!;
    const liveRelationships = world.components.relationships.get(personId)!;
    expect(liveNeeds.hunger).toBe(50);
    expect(liveRelationships.friendIds).toEqual([1]);
  });

  it('eine spätere Mutation des live WorldState beeinflusst eine bereits erzeugte Observation nicht', () => {
    const world = buildTestWorld();
    const personId = addPerson(world, { needs: { hunger: 80, energy: 80, social: 80 } });

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const observation = observer.getPersonObservation(personId)!;

    world.components.needs.get(personId)!.hunger = 1;

    expect(observation.needs.hunger).toBe(80);
  });

  it('getWorldSnapshot()-Ergebnis teilt keine Array-Referenz mit world.entities.alive', () => {
    const world = buildTestWorld();
    addPerson(world);

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const snapshot = observer.getWorldSnapshot();

    (snapshot.people as unknown[]).push({});
    expect(world.entities.alive).toHaveLength(1);
  });

  it('BirthEvent.parentIds wird unabhängig kopiert (kein geteiltes Array mit der History)', () => {
    const world = buildTestWorld();
    world.events.history.push({ type: 'BirthEvent', sequence: 0, tick: 1, entityId: 5 as never, parentIds: [1 as never, 2 as never] });

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const [event] = observer.getRecentEvents();
    (event as { parentIds: number[] }).parentIds.push(999);

    const [liveEvent] = world.events.history.toArray();
    expect((liveEvent as { parentIds: number[] }).parentIds).toEqual([1, 2]);
  });
});

describe('WorldObserver — Performance (kein O(n²), Subtask 19 §32.12)', () => {
  it('bleibt bei mehreren hundert konzentrierten Entities schnell (< 200ms)', () => {
    const buildings = [makeTestBuilding(1, 'Field', 1, 10)];
    const world = buildTestWorld({
      locations: [{ id: asLocationId(1), name: 'Village', connections: [], buildingIds: [buildings[0]!.id] }],
      buildings,
    });
    for (let i = 0; i < 600; i++) {
      addPerson(world, { locationId: asLocationId(1) });
    }

    const observer = new WorldObserver(toWorldStateReader(world), makeConfig());
    const start = performance.now();
    const snapshot = observer.getWorldSnapshot();
    const elapsedMs = performance.now() - start;

    expect(snapshot.people).toHaveLength(600);
    expect(snapshot.locations[0]!.personCount).toBe(600);
    expect(elapsedMs).toBeLessThan(200);
  });
});

describe('WorldObserver — v2/A1-Regressionsfelder unverändert lesbar', () => {
  it('liest role, partnerId und friendIds unverändert aus dem bestehenden Domänenmodell', () => {
    const config = makeTestConfig();
    const world = buildTestWorld({
      locations: config.worldGraph.locations.map((l) => ({
        id: asLocationId(l.id),
        name: l.name,
        connections: l.connections.map((c) => ({ to: asLocationId(c.to), travelTicks: c.travelTicks })),
        buildingIds: [],
      })),
    });
    const a = addPerson(world, { ticksAlive: 50 });
    const b = addPerson(world, { ticksAlive: 50 });
    world.components.identity.set(a, { kind: 'person', displayName: 'A', role: 'Farmer' });
    world.components.relationships.set(a, { parentIds: [], childIds: [], friendIds: [b], partnerId: b });
    world.components.relationships.set(b, { parentIds: [], childIds: [], friendIds: [a], partnerId: a });

    const observer = new WorldObserver(toWorldStateReader(world), config);
    const observation = observer.getPersonObservation(a)!;

    expect(observation.role).toBe('Farmer');
    expect(observation.partnerId).toBe(b);
    expect(observation.friendIds).toEqual([b]);
  });
});
