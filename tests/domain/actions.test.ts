import { describe, it, expect } from 'vitest';
import { createEatAction } from '../../src/simulation/decision/actions/Eat.js';
import { createSleepAction } from '../../src/simulation/decision/actions/Sleep.js';
import { createSocializeAction } from '../../src/simulation/decision/actions/Socialize.js';
import { createWorkAction } from '../../src/simulation/decision/actions/Work.js';
import { createTradeAction } from '../../src/simulation/decision/actions/Trade.js';
import { FixedRatioMarket } from '../../src/simulation/economy/FixedRatioMarket.js';
import { Mulberry32RandomSource } from '../../src/random/Mulberry32RandomSource.js';
import { toWorldStateReader } from '../../src/world/WorldState.js';
import { buildTestWorld, addPerson, addAnimal, makeTestBuilding } from '../helpers/testWorld.js';
import { asLocationId } from '../../src/domain/value-objects/ids.js';

describe('Eat-Action (Subtask 3 §4.2/§10)', () => {
  const eat = createEatAction({ eatRestorePerTick: 20, grazeRestorePerTick: 15 });

  it('Person: canExecute erfordert Food > 0 im eigenen Inventory', () => {
    const world = buildTestWorld();
    const person = addPerson(world);
    expect(eat.canExecute(person, toWorldStateReader(world))).toBe(false);
    world.components.inventory.get(person)!.amounts.Food = 5;
    expect(eat.canExecute(person, toWorldStateReader(world))).toBe(true);
  });

  it('Animal: canExecute ist immer true (Grasen ohne Bestand)', () => {
    const world = buildTestWorld();
    const animal = addAnimal(world);
    expect(eat.canExecute(animal, toWorldStateReader(world))).toBe(true);
  });

  it('Person: execute konsumiert Food und erhöht hunger', () => {
    const world = buildTestWorld();
    const person = addPerson(world, { needs: { hunger: 50 } });
    world.components.inventory.get(person)!.amounts.Food = 30;
    const rng = new Mulberry32RandomSource(1);
    eat.execute(person, world, rng);
    expect(world.components.needs.get(person)!.hunger).toBe(70);
    expect(world.components.inventory.get(person)!.amounts.Food).toBe(10);
  });

  it('Animal: execute erhöht hunger ohne Inventory-Zugriff', () => {
    const world = buildTestWorld();
    const animal = addAnimal(world, { needs: { hunger: 50 } });
    const rng = new Mulberry32RandomSource(1);
    eat.execute(animal, world, rng);
    expect(world.components.needs.get(animal)!.hunger).toBe(65);
  });
});

describe('Sleep-Action (Subtask 3 §6)', () => {
  const sleep = createSleepAction({ sleepRestorePerTick: 20 });

  it('canExecute ist für Person und Animal generisch true', () => {
    const world = buildTestWorld();
    const person = addPerson(world);
    const animal = addAnimal(world);
    expect(sleep.canExecute(person, toWorldStateReader(world))).toBe(true);
    expect(sleep.canExecute(animal, toWorldStateReader(world))).toBe(true);
  });

  it('execute erhöht energy', () => {
    const world = buildTestWorld();
    const person = addPerson(world, { needs: { energy: 50 } });
    sleep.execute(person, world, new Mulberry32RandomSource(1));
    expect(world.components.needs.get(person)!.energy).toBe(70);
  });
});

describe('Socialize-Action (Subtask 3.6b, verbindlich)', () => {
  const socialize = createSocializeAction({ socializeRestorePerTick: 20 });

  it('canExecute liefert für Animal stets false', () => {
    const world = buildTestWorld();
    const animal = addAnimal(world);
    expect(socialize.canExecute(animal, toWorldStateReader(world))).toBe(false);
  });

  it('canExecute liefert für Person true', () => {
    const world = buildTestWorld();
    const person = addPerson(world);
    expect(socialize.canExecute(person, toWorldStateReader(world))).toBe(true);
  });
});

describe('Work-Action (Subtask 2 §11, Subtask 4/ADR-14)', () => {
  const work = createWorkAction({ workTransferPerTick: 5, minAdultAgeTicks: 0 });

  it('canExecute prüft nur grundsätzliche Erreichbarkeit, nicht Anwesenheit', () => {
    const world = buildTestWorld({
      buildings: [makeTestBuilding(1, 'Field', 2, 10)],
    });
    const person = addPerson(world, { locationId: asLocationId(1) }); // nicht am Field
    expect(work.canExecute(person, toWorldStateReader(world))).toBe(true);
  });

  it('requiredLocation liefert das Gebäude, wenn nicht bereits dort', () => {
    const world = buildTestWorld({
      buildings: [makeTestBuilding(1, 'Field', 2, 10)],
    });
    const person = addPerson(world, { locationId: asLocationId(1) });
    expect(work.requiredLocation!(person, toWorldStateReader(world))).toBe(2);
  });

  it('execute transferiert nur, wenn tatsächlich am Gebäude (Ausführungsvoraussetzung)', () => {
    const world = buildTestWorld({
      buildings: [makeTestBuilding(1, 'Field', 2, 10)],
    });
    const personAway = addPerson(world, { locationId: asLocationId(1) });
    const result = work.execute(personAway, world, new Mulberry32RandomSource(1));
    expect(world.components.inventory.get(personAway)!.amounts.Food).toBe(0);
    expect(result.done).toBe(true);

    const personHere = addPerson(world, { locationId: asLocationId(2) });
    work.execute(personHere, world, new Mulberry32RandomSource(1));
    expect(world.components.inventory.get(personHere)!.amounts.Food).toBe(5);
  });

  it('Bestand kann nicht überzogen werden (Invariante I2)', () => {
    const world = buildTestWorld({
      buildings: [makeTestBuilding(1, 'Field', 1, 2)],
    });
    const person = addPerson(world, { locationId: asLocationId(1) });
    work.execute(person, world, new Mulberry32RandomSource(1));
    const building = world.environment.buildings[0]!;
    expect(building.inventory.Food).toBe(0);
    expect(world.components.inventory.get(person)!.amounts.Food).toBe(2);
  });
});

describe('Trade-Action (Subtask 2 §11, Subtask 4/ADR-14)', () => {
  it('führt einen Tausch zwischen zwei Personen am Market durch', () => {
    const world = buildTestWorld({
      buildings: [makeTestBuilding(1, 'Market', 1)],
    });
    const seller = addPerson(world, { locationId: asLocationId(1) });
    const buyer = addPerson(world, { locationId: asLocationId(1) });
    world.components.inventory.get(seller)!.amounts.Food = 10;
    world.components.inventory.get(buyer)!.amounts.Wood = 20;

    const market = new FixedRatioMarket(1.5);
    const trade = createTradeAction({ tradeAmountPerTrade: 5, minAdultAgeTicks: 0 }, market);
    const result = trade.execute(seller, world, new Mulberry32RandomSource(1));

    expect(result.events?.[0]?.type).toBe('TradeEvent');
    expect(world.components.inventory.get(seller)!.amounts.Food).toBe(5);
    expect(world.components.inventory.get(buyer)!.amounts.Food).toBe(5);
  });
});
