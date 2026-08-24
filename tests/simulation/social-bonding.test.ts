import { describe, it, expect } from 'vitest';
import { runSocialBondingSystem } from '../../src/simulation/systems/SocialBondingSystem.js';
import { runCleanupSystem } from '../../src/simulation/systems/CleanupSystem.js';
import { runDecisionSystem } from '../../src/simulation/decision/DecisionSystem.js';
import { createSocializeAction } from '../../src/simulation/decision/actions/Socialize.js';
import { Mulberry32RandomSource } from '../../src/random/Mulberry32RandomSource.js';
import { markForRemoval } from '../../src/world/EntityRegistry.js';
import { toWorldStateReader } from '../../src/world/WorldState.js';
import { buildTestWorld, addPerson, addAnimal, buildTestContext } from '../helpers/testWorld.js';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { makeTestConfig } from '../helpers/testConfig.js';
import { asLocationId, asActionId, type EntityId } from '../../src/domain/value-objects/ids.js';
import type { WorldState } from '../../src/world/WorldState.js';
import type { PersonNeeds } from '../../src/domain/components/needs.js';

// SocialBondingSystem (A1, Subtask 15-17, ADR-A1-02): erkennt deterministisch
// gemeinsame, co-lokale Socialize-Ausführung und erzeugt daraus reziproke,
// nicht exklusive Freundschaften (Relationships.friendIds). Getestet über
// die exportierte Systemfunktion (analog zu partnership.test.ts), nicht über
// interne Hilfsfunktionen.

function setSocializing(world: WorldState, id: EntityId): void {
  world.components.aiState.set(id, { currentActivity: { kind: 'Performing', actionId: asActionId('Socialize'), ticksInAction: 0 } });
}

// Standing-Invariante V2-A1-I2/I3/I4 über die gesamte lebende Population,
// nach dem Muster von assertPartnershipInvariant in partnership.test.ts.
function assertFriendshipInvariant(world: WorldState): void {
  for (const id of world.entities.alive) {
    const rel = world.components.relationships.get(id);
    if (!rel) continue;
    expect(rel.friendIds.includes(id)).toBe(false); // V2-A1-I3
    expect(new Set(rel.friendIds).size).toBe(rel.friendIds.length); // V2-A1-I4
    for (const friendId of rel.friendIds) {
      if (!world.entities.alive.includes(friendId)) continue; // V2-A1-I2 gilt nur unter Lebenden
      expect(world.components.relationships.get(friendId)?.friendIds.includes(id)).toBe(true);
    }
  }
}

describe('19.1/19.2 — Entstehung und Reziprozität', () => {
  it('zwei Personen, die gleichzeitig am selben Ort Socialize ausführen, werden reziprok Freunde', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const b = addPerson(world, { locationId: asLocationId(1) });
    setSocializing(world, a);
    setSocializing(world, b);
    const ctx = buildTestContext(world);

    runSocialBondingSystem(world, ctx);

    expect(world.components.relationships.get(a)!.friendIds).toEqual([b]);
    expect(world.components.relationships.get(b)!.friendIds).toEqual([a]);
    assertFriendshipInvariant(world);
  });

  it('Personen an unterschiedlichen Orten oder ohne Socialize werden nicht befreundet', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const b = addPerson(world, { locationId: asLocationId(2) }); // anderer Ort
    const c = addPerson(world, { locationId: asLocationId(1) }); // idle, kein Socialize
    setSocializing(world, a);
    setSocializing(world, b);
    const ctx = buildTestContext(world);

    runSocialBondingSystem(world, ctx);

    expect(world.components.relationships.get(a)!.friendIds).toEqual([]);
    expect(world.components.relationships.get(b)!.friendIds).toEqual([]);
    expect(world.components.relationships.get(c)!.friendIds).toEqual([]);
  });
});

describe('19.3 — keine Duplikate', () => {
  it('mehrfaches Erkennen derselben Socialize-Situation über mehrere Ticks erzeugt kein Duplikat', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const b = addPerson(world, { locationId: asLocationId(1) });
    setSocializing(world, a);
    setSocializing(world, b);
    const ctx = buildTestContext(world);

    runSocialBondingSystem(world, ctx);
    runSocialBondingSystem(world, ctx);
    runSocialBondingSystem(world, ctx);

    expect(world.components.relationships.get(a)!.friendIds).toEqual([b]);
    expect(world.components.relationships.get(b)!.friendIds).toEqual([a]);
  });
});

describe('19.4 — keine Selbstbeziehung', () => {
  it('eine einzelne, allein socializende Person erhält keine Selbstfreundschaft', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    setSocializing(world, a);
    const ctx = buildTestContext(world);

    runSocialBondingSystem(world, ctx);

    expect(world.components.relationships.get(a)!.friendIds).toEqual([]);
    assertFriendshipInvariant(world);
  });
});

describe('19.5 — mehrere Freunde gleichzeitig', () => {
  it('eine Person kann über mehrere Ticks mit wechselnder Zusammensetzung mehrere Freunde ansammeln', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const b = addPerson(world, { locationId: asLocationId(1) });
    const c = addPerson(world, { locationId: asLocationId(1) });
    const ctx = buildTestContext(world);

    setSocializing(world, a);
    setSocializing(world, b);
    runSocialBondingSystem(world, ctx); // Tick 1: a<->b

    world.components.aiState.set(b, { currentActivity: { kind: 'Idle' } }); // b socializt nicht mehr
    setSocializing(world, a);
    setSocializing(world, c);
    runSocialBondingSystem(world, ctx); // Tick 2: a<->c (b nicht mehr Kandidat)

    expect(world.components.relationships.get(a)!.friendIds).toEqual([b, c]);
    expect(world.components.relationships.get(b)!.friendIds).toEqual([a]);
    expect(world.components.relationships.get(c)!.friendIds).toEqual([a]);
    assertFriendshipInvariant(world);
  });
});

describe('19.6 — Partner-/Freund-Unabhängigkeit (V2-A1-I6)', () => {
  it('eine Person kann mit ihrem Partner gleichzeitig befreundet sein; die Freundschaftsbildung verändert partnerId nicht', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const b = addPerson(world, { locationId: asLocationId(1) });
    world.components.relationships.get(a)!.partnerId = b;
    world.components.relationships.get(b)!.partnerId = a;
    setSocializing(world, a);
    setSocializing(world, b);
    const ctx = buildTestContext(world);

    runSocialBondingSystem(world, ctx);

    expect(world.components.relationships.get(a)!.friendIds).toEqual([b]);
    expect(world.components.relationships.get(b)!.friendIds).toEqual([a]);
    expect(world.components.relationships.get(a)!.partnerId).toBe(b);
    expect(world.components.relationships.get(b)!.partnerId).toBe(a);
  });
});

describe('19.7 — Socialize bleibt unverändert (Regression)', () => {
  it('Socialize erhöht weiterhin ausschließlich den eigenen social-Bedarf, unabhängig von Freundschaften', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1), needs: { social: 50 } });
    const socialize = createSocializeAction({ socializeRestorePerTick: 20 });

    const result = socialize.execute(a, world, new Mulberry32RandomSource(1));

    expect((world.components.needs.get(a)! as PersonNeeds).social).toBe(70);
    expect(result.done).toBe(false);
    expect(world.components.relationships.get(a)!.friendIds).toEqual([]);
  });
});

describe('19.8 — Decision bleibt unverändert (Regression)', () => {
  it('Socialize-Score ist identisch, unabhängig davon, ob die Person bereits Freunde besitzt', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1), needs: { social: 40 } });
    const b = addPerson(world, { locationId: asLocationId(1) });
    const socialize = createSocializeAction({ socializeRestorePerTick: 20 });
    const reader = toWorldStateReader(world);

    const scoreWithoutFriends = socialize.score(a, reader);
    world.components.relationships.get(a)!.friendIds = [b];

    const scoreWithFriends = socialize.score(a, reader);

    expect(scoreWithFriends).toBe(scoreWithoutFriends);
  });

  it('DecisionSystem wählt weiterhin dieselbe Action, unabhängig von bestehenden Freundschaften', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1), needs: { social: 0, hunger: 100, energy: 100 } });
    const b = addPerson(world, { locationId: asLocationId(1) });
    const socialize = createSocializeAction({ socializeRestorePerTick: 20 });
    const ctx = buildTestContext(world);

    runDecisionSystem(world, ctx, [socialize]);
    const chosenWithoutFriends = world.components.aiState.get(a)!.currentActivity;

    world.components.aiState.set(a, { currentActivity: { kind: 'Idle' } });
    world.components.relationships.get(a)!.friendIds = [b];
    runDecisionSystem(world, ctx, [socialize]);
    const chosenWithFriends = world.components.aiState.get(a)!.currentActivity;

    expect(chosenWithFriends).toEqual(chosenWithoutFriends);
  });
});

describe('19.9 — Animal-Schutz (V2-A1-I5)', () => {
  it('Animals werden trotz identischer AIState-Bedingung nicht befreundet', () => {
    const world = buildTestWorld();
    const a = addAnimal(world, { locationId: asLocationId(1) });
    const b = addAnimal(world, { locationId: asLocationId(1) });
    setSocializing(world, a); // künstlich erzwungen; Socialize.canExecute liefert für Animal real stets false
    setSocializing(world, b);
    const ctx = buildTestContext(world);

    runSocialBondingSystem(world, ctx);

    expect(world.components.relationships.get(a)!.friendIds).toEqual([]);
    expect(world.components.relationships.get(b)!.friendIds).toEqual([]);
  });

  it('ein Animal wird nicht Freund einer gleichzeitig socializenden Person', () => {
    const world = buildTestWorld();
    const person = addPerson(world, { locationId: asLocationId(1) });
    const animal = addAnimal(world, { locationId: asLocationId(1) });
    setSocializing(world, person);
    setSocializing(world, animal);
    const ctx = buildTestContext(world);

    runSocialBondingSystem(world, ctx);

    expect(world.components.relationships.get(person)!.friendIds).toEqual([]);
    expect(world.components.relationships.get(animal)!.friendIds).toEqual([]);
  });
});

describe('19.10 — Standing-Verhalten nach Tod', () => {
  it('nach dem Tod eines Freundes bleibt die Referenz beim Überlebenden bestehen (kein kaskadierendes Bereinigen)', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const doomed = addPerson(world, { locationId: asLocationId(1) });
    setSocializing(world, a);
    setSocializing(world, doomed);
    const ctx = buildTestContext(world);
    runSocialBondingSystem(world, ctx);
    expect(world.components.relationships.get(a)!.friendIds).toEqual([doomed]);

    markForRemoval(world, doomed);
    runCleanupSystem(world);

    expect(world.entities.alive.includes(doomed)).toBe(false);
    expect(world.components.relationships.get(a)!.friendIds).toEqual([doomed]);
  });

  it('eine Freundschaft löst sich nicht durch Ortswechsel oder ausbleibendes Socialize (Standing-Beziehung)', () => {
    const world = buildTestWorld();
    const a = addPerson(world, { locationId: asLocationId(1) });
    const b = addPerson(world, { locationId: asLocationId(1) });
    setSocializing(world, a);
    setSocializing(world, b);
    const ctx = buildTestContext(world);
    runSocialBondingSystem(world, ctx);

    world.components.position.set(b, { locationId: asLocationId(2) });
    world.components.aiState.set(a, { currentActivity: { kind: 'Idle' } });
    world.components.aiState.set(b, { currentActivity: { kind: 'Idle' } });
    for (let i = 0; i < 10; i++) runSocialBondingSystem(world, ctx);

    expect(world.components.relationships.get(a)!.friendIds).toEqual([b]);
    expect(world.components.relationships.get(b)!.friendIds).toEqual([a]);
  });
});

describe('20 — Integrationstest über die echte Tick-Schleife', () => {
  it('zwei Personen mit hohem sozialem Bedürfnis am selben Ort werden über echte Ticks hinweg reziprok Freunde', () => {
    const config = makeTestConfig({ initialPopulation: { humans: 2, animals: 0 } });
    const engine = SimulationEngine.create(config, new ConsoleLogger('error'));
    const world = engine.getWorld();
    const [a, b] = world.entities.alive as EntityId[];

    // Beide bereits am selben Ort (Round-Robin-Seeding könnte sie sonst auf
    // zwei Orte verteilen); Bedürfnisse so gesetzt, dass Socialize
    // (score=(100-social)/100) für beide die klar höchste bewertete Action
    // ist und Eat/Sleep/Work/Trade nicht konkurrieren.
    world.components.position.set(a!, { locationId: asLocationId(1) });
    world.components.position.set(b!, { locationId: asLocationId(1) });
    const needsA = world.components.needs.get(a!)! as PersonNeeds;
    const needsB = world.components.needs.get(b!)! as PersonNeeds;
    needsA.hunger = 100;
    needsA.energy = 100;
    needsA.social = 0;
    needsB.hunger = 100;
    needsB.energy = 100;
    needsB.social = 0;

    for (let i = 0; i < 5; i++) engine.tick();

    expect(world.components.relationships.get(a!)!.friendIds).toContain(b);
    expect(world.components.relationships.get(b!)!.friendIds).toContain(a);
    assertFriendshipInvariant(world);
  });
});
