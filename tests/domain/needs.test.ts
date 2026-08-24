import { describe, it, expect } from 'vitest';
import { hasSocialNeed } from '../../src/domain/components/needs.js';
import { clampNeed } from '../../src/simulation/clamp.js';
import { runNeedsSystem } from '../../src/simulation/systems/NeedsSystem.js';
import { buildTestWorld, addPerson, addAnimal, buildTestContext } from '../helpers/testWorld.js';

describe('Needs (Subtask 2 §3, Subtask 3.6b)', () => {
  it('hasSocialNeed unterscheidet Person (mit social) von Animal (ohne)', () => {
    expect(hasSocialNeed({ hunger: 1, energy: 1, social: 1 })).toBe(true);
    expect(hasSocialNeed({ hunger: 1, energy: 1 })).toBe(false);
  });

  it('clampNeed klemmt auf [0,100]', () => {
    expect(clampNeed(-5)).toBe(0);
    expect(clampNeed(150)).toBe(100);
    expect(clampNeed(42)).toBe(42);
  });
});

describe('NeedsSystem (Subtask 2 §5, Perception 4.)', () => {
  it('Bedürfnis-Zerfall: hunger sinkt um konfigurierte Rate', () => {
    const world = buildTestWorld();
    const person = addPerson(world);
    const ctx = buildTestContext(world, { needs: { hungerDecayPerTick: 5, energyDecayPerTick: 0, socialDecayPerTick: 0, starvationDeathThresholdTicks: 72 } });
    runNeedsSystem(world, ctx);
    expect(world.components.needs.get(person)!.hunger).toBe(95);
  });

  it('wendet Zerfall nur auf tatsächlich vorhandene Needs-Felder an (Animal ohne social)', () => {
    const world = buildTestWorld();
    const animal = addAnimal(world);
    const ctx = buildTestContext(world, { needs: { hungerDecayPerTick: 1, energyDecayPerTick: 1, socialDecayPerTick: 10, starvationDeathThresholdTicks: 72 } });
    runNeedsSystem(world, ctx);
    const needs = world.components.needs.get(animal)!;
    expect('social' in needs).toBe(false);
  });

  it('Zerfall wird nie negativ (geklemmt)', () => {
    const world = buildTestWorld();
    const person = addPerson(world, { needs: { hunger: 2 } });
    const ctx = buildTestContext(world, { needs: { hungerDecayPerTick: 10, energyDecayPerTick: 0, socialDecayPerTick: 0, starvationDeathThresholdTicks: 72 } });
    runNeedsSystem(world, ctx);
    expect(world.components.needs.get(person)!.hunger).toBe(0);
  });
});
