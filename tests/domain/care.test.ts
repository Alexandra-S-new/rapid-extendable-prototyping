import { describe, it, expect } from 'vitest';
import { createCareAction } from '../../src/simulation/decision/actions/Care.js';
import { Mulberry32RandomSource } from '../../src/random/Mulberry32RandomSource.js';
import { toWorldStateReader } from '../../src/world/WorldState.js';
import { buildTestWorld, addPerson } from '../helpers/testWorld.js';
import { asLocationId, type EntityId } from '../../src/domain/value-objects/ids.js';

// Care-Action (v2, Subtask 9 §4/ADR-V2-01, V2-I8): Kinder-Versorgung.
// ADR-14-konform wie Work/Trade — canExecute prüft nur Erreichbarkeit,
// execute prüft tatsächliche Anwesenheit.

describe('Care-Action (v2, Subtask 9 §4/ADR-V2-01)', () => {
  const care = createCareAction({ careTransferPerTick: 10, minAdultAgeTicks: 10 });

  it('canExecute ist false ohne eigenes Food', () => {
    const world = buildTestWorld();
    const parent = addPerson(world);
    const child = addPerson(world, { ticksAlive: 0, needs: { hunger: 40 } });
    world.components.relationships.get(parent)!.childIds.push(child);
    expect(care.canExecute(parent, toWorldStateReader(world))).toBe(false);
  });

  it('canExecute ist false ohne bedürftiges Kind (keine Kinder)', () => {
    const world = buildTestWorld();
    const parent = addPerson(world);
    world.components.inventory.get(parent)!.amounts.Food = 20;
    expect(care.canExecute(parent, toWorldStateReader(world))).toBe(false);
  });

  it('canExecute ist false, wenn das einzige Kind bereits erwachsen ist', () => {
    const world = buildTestWorld();
    const parent = addPerson(world);
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const grownChild = addPerson(world, { ticksAlive: 10, needs: { hunger: 40 } });
    world.components.relationships.get(parent)!.childIds.push(grownChild);
    expect(care.canExecute(parent, toWorldStateReader(world))).toBe(false);
  });

  it('canExecute ist false, wenn das Kind bereits verstorben ist (identity fehlt)', () => {
    const world = buildTestWorld();
    const parent = addPerson(world);
    world.components.inventory.get(parent)!.amounts.Food = 20;
    world.components.relationships.get(parent)!.childIds.push(999 as EntityId);
    expect(care.canExecute(parent, toWorldStateReader(world))).toBe(false);
  });

  it('canExecute ist false, wenn das Kind keinen Bedarf hat (hunger === 100)', () => {
    const world = buildTestWorld();
    const parent = addPerson(world);
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const child = addPerson(world, { ticksAlive: 0, needs: { hunger: 100 } });
    world.components.relationships.get(parent)!.childIds.push(child);
    expect(care.canExecute(parent, toWorldStateReader(world))).toBe(false);
  });

  it('canExecute ist true bei eigenem Food und einem lebenden, bedürftigen Kind', () => {
    const world = buildTestWorld();
    const parent = addPerson(world);
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const child = addPerson(world, { ticksAlive: 0, needs: { hunger: 40 } });
    world.components.relationships.get(parent)!.childIds.push(child);
    expect(care.canExecute(parent, toWorldStateReader(world))).toBe(true);
  });

  it('score entspricht (100 - hunger) / 100 des bedürftigsten Kindes', () => {
    const world = buildTestWorld();
    const parent = addPerson(world);
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const child = addPerson(world, { ticksAlive: 0, needs: { hunger: 40 } });
    world.components.relationships.get(parent)!.childIds.push(child);
    expect(care.score(parent, toWorldStateReader(world))).toBeCloseTo(0.6, 10);
  });

  it('wählt unter mehreren Kindern das mit dem niedrigsten hunger', () => {
    const world = buildTestWorld();
    const parent = addPerson(world);
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const lessNeedy = addPerson(world, { ticksAlive: 0, needs: { hunger: 80 }, locationId: asLocationId(2) });
    const neediest = addPerson(world, { ticksAlive: 0, needs: { hunger: 10 }, locationId: asLocationId(2) });
    const rel = world.components.relationships.get(parent)!;
    rel.childIds.push(lessNeedy, neediest);
    expect(care.requiredLocation!(parent, toWorldStateReader(world))).toBe(2);
    expect(care.score(parent, toWorldStateReader(world))).toBeCloseTo(0.9, 10);
  });

  it('Tie-Break bei gleichem hunger: niedrigste EntityId gewinnt', () => {
    const world = buildTestWorld();
    const parent = addPerson(world);
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const childLowerId = addPerson(world, { ticksAlive: 0, needs: { hunger: 50 } });
    const childHigherId = addPerson(world, { ticksAlive: 0, needs: { hunger: 50 } });
    const rel = world.components.relationships.get(parent)!;
    rel.childIds.push(childHigherId, childLowerId);
    care.execute(parent, world, new Mulberry32RandomSource(1));
    expect(world.components.needs.get(childLowerId)!.hunger).toBe(60);
    expect(world.components.needs.get(childHigherId)!.hunger).toBe(50);
  });

  it('requiredLocation liefert den Standort des bedürftigsten Kindes', () => {
    const world = buildTestWorld();
    const parent = addPerson(world, { locationId: asLocationId(1) });
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const child = addPerson(world, { ticksAlive: 0, needs: { hunger: 40 }, locationId: asLocationId(2) });
    world.components.relationships.get(parent)!.childIds.push(child);
    expect(care.requiredLocation!(parent, toWorldStateReader(world))).toBe(2);
  });

  it('execute transferiert nichts, wenn Elternteil und Kind nicht am selben Ort sind (V2-I8)', () => {
    const world = buildTestWorld();
    const parent = addPerson(world, { locationId: asLocationId(1) });
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const child = addPerson(world, { ticksAlive: 0, needs: { hunger: 40 }, locationId: asLocationId(2) });
    world.components.relationships.get(parent)!.childIds.push(child);

    const result = care.execute(parent, world, new Mulberry32RandomSource(1));

    expect(result.done).toBe(true);
    expect(world.components.inventory.get(parent)!.amounts.Food).toBe(20);
    expect(world.components.needs.get(child)!.hunger).toBe(40);
  });

  it('execute transferiert Food (geklemmt auf careTransferPerTick und Bestand), wenn am selben Ort', () => {
    const world = buildTestWorld();
    const parent = addPerson(world, { locationId: asLocationId(1) });
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const child = addPerson(world, { ticksAlive: 0, needs: { hunger: 40 }, locationId: asLocationId(1) });
    world.components.relationships.get(parent)!.childIds.push(child);

    care.execute(parent, world, new Mulberry32RandomSource(1));

    expect(world.components.inventory.get(parent)!.amounts.Food).toBe(10); // 20 - 10 (careTransferPerTick)
    expect(world.components.needs.get(child)!.hunger).toBe(50); // 40 + 10, geklemmt auf 100
  });

  it('execute klemmt den Hunger-Zuwachs auf 100 (kein Überschreiten)', () => {
    const world = buildTestWorld();
    const parent = addPerson(world, { locationId: asLocationId(1) });
    world.components.inventory.get(parent)!.amounts.Food = 20;
    const child = addPerson(world, { ticksAlive: 0, needs: { hunger: 95 }, locationId: asLocationId(1) });
    world.components.relationships.get(parent)!.childIds.push(child);

    care.execute(parent, world, new Mulberry32RandomSource(1));

    expect(world.components.needs.get(child)!.hunger).toBe(100);
  });

  it('execute klemmt den Food-Abzug auf den tatsächlichen Bestand (kein negativer Bestand)', () => {
    const world = buildTestWorld();
    const parent = addPerson(world, { locationId: asLocationId(1) });
    world.components.inventory.get(parent)!.amounts.Food = 4;
    const child = addPerson(world, { ticksAlive: 0, needs: { hunger: 40 }, locationId: asLocationId(1) });
    world.components.relationships.get(parent)!.childIds.push(child);

    care.execute(parent, world, new Mulberry32RandomSource(1));

    expect(world.components.inventory.get(parent)!.amounts.Food).toBe(0);
    expect(world.components.needs.get(child)!.hunger).toBe(44);
  });
});
