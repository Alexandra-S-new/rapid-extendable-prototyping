import { describe, it, expect } from 'vitest';
import { createWorkAction } from '../../src/simulation/decision/actions/Work.js';
import { createTradeAction } from '../../src/simulation/decision/actions/Trade.js';
import { FixedRatioMarket } from '../../src/simulation/economy/FixedRatioMarket.js';
import { toWorldStateReader } from '../../src/world/WorldState.js';
import { buildTestWorld, addPerson, makeTestBuilding } from '../helpers/testWorld.js';
import { asLocationId } from '../../src/domain/value-objects/ids.js';

// Altersgate (v2, Subtask 9 §8.3, V2-I3): Work/Trade sind für Kinder
// (ticksAlive < minAdultAgeTicks) nicht ausführbar — reproduces isAdult()
// (simulation/lifeStage.ts), das deriveLifeStage() (v1, bislang ungenutzt)
// wiederverwendet.

describe('Altersgate Work (V2-I3)', () => {
  const work = createWorkAction({ workTransferPerTick: 5, minAdultAgeTicks: 10 });

  it('canExecute ist false für ein Kind, obwohl ein Field erreichbar ist', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Field', 2, 10)] });
    const child = addPerson(world, { locationId: asLocationId(1), ticksAlive: 5 });
    expect(work.canExecute(child, toWorldStateReader(world))).toBe(false);
  });

  it('canExecute ist true für einen Erwachsenen unter sonst gleichen Bedingungen', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Field', 2, 10)] });
    const adult = addPerson(world, { locationId: asLocationId(1), ticksAlive: 10 });
    expect(work.canExecute(adult, toWorldStateReader(world))).toBe(true);
  });
});

describe('Altersgate Trade (V2-I3)', () => {
  const market = new FixedRatioMarket(1);
  const trade = createTradeAction({ tradeAmountPerTrade: 5, minAdultAgeTicks: 10 }, market);

  it('canExecute ist false für ein Kind, obwohl handelbarer Überschuss vorhanden ist', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Market', 1)] });
    const child = addPerson(world, { locationId: asLocationId(1), ticksAlive: 5 });
    world.components.inventory.get(child)!.amounts.Food = 20;
    expect(trade.canExecute(child, toWorldStateReader(world))).toBe(false);
  });

  it('canExecute ist true für einen Erwachsenen mit demselben Überschuss', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Market', 1)] });
    const adult = addPerson(world, { locationId: asLocationId(1), ticksAlive: 10 });
    world.components.inventory.get(adult)!.amounts.Food = 20;
    expect(trade.canExecute(adult, toWorldStateReader(world))).toBe(true);
  });
});
