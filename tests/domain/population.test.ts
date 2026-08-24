import { describe, it, expect } from 'vitest';
import { runPopulationSystem } from '../../src/simulation/systems/PopulationSystem.js';
import { buildTestWorld, addPerson, addAnimal, buildTestContext } from '../helpers/testWorld.js';
import { asLocationId } from '../../src/domain/value-objects/ids.js';

describe('PopulationSystem — Alterung (Subtask 2 §12, generisch)', () => {
  it('erhöht Age.ticksAlive für Person und Animal gleichermaßen', () => {
    const world = buildTestWorld();
    const person = addPerson(world);
    const animal = addAnimal(world);
    const ctx = buildTestContext(world);
    runPopulationSystem(world, ctx);
    expect(world.components.age.get(person)!.ticksAlive).toBe(1);
    expect(world.components.age.get(animal)!.ticksAlive).toBe(1);
  });
});

describe('PopulationSystem — Sterblichkeit (Subtask 3 §10, generisch)', () => {
  it('markiert Entities mit Hunger seit N Ticks bei 0 zum Tod (starvation)', () => {
    const world = buildTestWorld();
    const person = addPerson(world, { needs: { hunger: 0 } });
    world.components.age.get(person)!.ticksAtZeroHunger = 100;
    const ctx = buildTestContext(world, {
      needs: { hungerDecayPerTick: 1, energyDecayPerTick: 1, socialDecayPerTick: 1, starvationDeathThresholdTicks: 72 },
    });
    runPopulationSystem(world, ctx);
    expect(world.entities.pendingRemovals).toContain(person);
    const deathEvent = world.events.pending.find((e) => e.type === 'DeathEvent');
    expect(deathEvent).toMatchObject({ type: 'DeathEvent', entityId: person, cause: 'starvation' });
  });

  it('gilt generisch auch für Animal', () => {
    const world = buildTestWorld();
    const animal = addAnimal(world, { needs: { hunger: 0 } });
    world.components.age.get(animal)!.ticksAtZeroHunger = 100;
    const ctx = buildTestContext(world);
    runPopulationSystem(world, ctx);
    expect(world.entities.pendingRemovals).toContain(animal);
  });

  it('markiert Entities über der maximalen Lebensspanne zum Tod (old_age)', () => {
    const world = buildTestWorld();
    const person = addPerson(world, { ticksAlive: 999_999 });
    const ctx = buildTestContext(world, { lifespan: { baseMaxLifespanTicks: 100, lifespanJitterTicks: 0 } });
    runPopulationSystem(world, ctx);
    const deathEvent = world.events.pending.find((e) => e.type === 'DeathEvent');
    expect(deathEvent).toMatchObject({ type: 'DeathEvent', entityId: person, cause: 'old_age' });
  });
});

describe('PopulationSystem — Fortpflanzung (Subtask 3.6a, verbindlich)', () => {
  it('erzeugt ein Kind für zwei eligible Personen am selben Ort', () => {
    const world = buildTestWorld();
    const p1 = addPerson(world, { locationId: asLocationId(1), ticksAlive: 1000, needs: { hunger: 90, energy: 90, social: 90 } });
    const p2 = addPerson(world, { locationId: asLocationId(1), ticksAlive: 1000, needs: { hunger: 90, energy: 90, social: 90 } });
    const ctx = buildTestContext(world, {
      reproduction: { minAdultAgeTicks: 100, birthProbabilityPerEligiblePair: 1, crisisThreshold: 30 },
    });
    runPopulationSystem(world, ctx);
    const birthEvent = world.events.pending.find((e) => e.type === 'BirthEvent');
    expect(birthEvent).toBeDefined();
    if (birthEvent?.type === 'BirthEvent') {
      expect(birthEvent.parentIds.sort()).toEqual([p1, p2].sort());
    }
  });

  it('Animals reproduzieren sich nicht, auch nicht bei erfüllten Alters-/Needs-Bedingungen', () => {
    const world = buildTestWorld();
    addAnimal(world, { locationId: asLocationId(1), ticksAlive: 1000, needs: { hunger: 90, energy: 90 } });
    addAnimal(world, { locationId: asLocationId(1), ticksAlive: 1000, needs: { hunger: 90, energy: 90 } });
    const ctx = buildTestContext(world, {
      reproduction: { minAdultAgeTicks: 100, birthProbabilityPerEligiblePair: 1, crisisThreshold: 30 },
    });
    runPopulationSystem(world, ctx);
    const birthEvent = world.events.pending.find((e) => e.type === 'BirthEvent');
    expect(birthEvent).toBeUndefined();
  });

  it('Personen unterhalb der Krisenschwelle sind nicht eligible', () => {
    const world = buildTestWorld();
    addPerson(world, { locationId: asLocationId(1), ticksAlive: 1000, needs: { hunger: 10, energy: 90, social: 90 } });
    addPerson(world, { locationId: asLocationId(1), ticksAlive: 1000, needs: { hunger: 90, energy: 90, social: 90 } });
    const ctx = buildTestContext(world, {
      reproduction: { minAdultAgeTicks: 100, birthProbabilityPerEligiblePair: 1, crisisThreshold: 30 },
    });
    runPopulationSystem(world, ctx);
    const birthEvent = world.events.pending.find((e) => e.type === 'BirthEvent');
    expect(birthEvent).toBeUndefined();
  });
});
