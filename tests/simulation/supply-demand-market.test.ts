import { describe, it, expect } from 'vitest';
import { SupplyDemandMarket } from '../../src/simulation/economy/SupplyDemandMarket.js';
import { FixedRatioMarket } from '../../src/simulation/economy/FixedRatioMarket.js';
import { toWorldStateReader } from '../../src/world/WorldState.js';
import { buildTestWorld, addPerson, makeTestBuilding } from '../helpers/testWorld.js';

// SupplyDemandMarket (v2, Subtask 9 §8.4/ADR-V2-05): Preis wird ausschließlich
// aus den live in WorldState gehaltenen Gesamtbeständen abgeleitet (kein
// eigener persistenter Marktzustand). V2-I7: effectiveRatio ist immer auf
// [minRatio, maxRatio] geklemmt.

const CONFIG = { elasticity: 0.5, minRatio: 0.5, maxRatio: 4 };

describe('SupplyDemandMarket.quote() — Preisbildung aus Gesamtbeständen', () => {
  it('bei ausgeglichenen Gesamtbeständen (Food === Wood) ist die effektive Ratio 1', () => {
    const world = buildTestWorld();
    const a = addPerson(world);
    world.components.inventory.get(a)!.amounts.Food = 100;
    world.components.inventory.get(a)!.amounts.Wood = 100;
    const market = new SupplyDemandMarket(CONFIG);
    const reader = toWorldStateReader(world);

    expect(market.quote('Wood', 10, reader)).toBeCloseTo(10, 10);
    expect(market.quote('Food', 10, reader)).toBeCloseTo(10, 10);
  });

  it('mehr Wood als Food im Umlauf erhöht den Food-Preis für Wood (Ratio > 1)', () => {
    const world = buildTestWorld();
    const a = addPerson(world);
    world.components.inventory.get(a)!.amounts.Food = 25;
    world.components.inventory.get(a)!.amounts.Wood = 100;
    const market = new SupplyDemandMarket(CONFIG);
    const reader = toWorldStateReader(world);

    // ratio = (100/25)^0.5 = 2
    expect(market.quote('Wood', 10, reader)).toBeCloseTo(20, 10);
    expect(market.quote('Food', 10, reader)).toBeCloseTo(5, 10);
  });

  it('bezieht auch Gebäudebestände (nicht nur Personen-Inventare) in die Gesamtsumme ein', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Field', 1, 75)] });
    const a = addPerson(world);
    world.components.inventory.get(a)!.amounts.Food = 25; // + 75 aus dem Building = 100 gesamt
    world.components.inventory.get(a)!.amounts.Wood = 100;
    const market = new SupplyDemandMarket(CONFIG);
    const reader = toWorldStateReader(world);

    expect(market.quote('Wood', 10, reader)).toBeCloseTo(10, 10); // ratio 1 wie im ausgeglichenen Fall
  });

  it('klemmt die effektive Ratio nach oben auf maxRatio (V2-I7)', () => {
    const world = buildTestWorld();
    const a = addPerson(world);
    world.components.inventory.get(a)!.amounts.Food = 1;
    world.components.inventory.get(a)!.amounts.Wood = 10_000;
    const market = new SupplyDemandMarket(CONFIG);
    const reader = toWorldStateReader(world);

    expect(market.quote('Wood', 1, reader)).toBeCloseTo(CONFIG.maxRatio, 10);
  });

  it('klemmt die effektive Ratio nach unten auf minRatio (V2-I7)', () => {
    const world = buildTestWorld();
    const a = addPerson(world);
    world.components.inventory.get(a)!.amounts.Food = 10_000;
    world.components.inventory.get(a)!.amounts.Wood = 1;
    const market = new SupplyDemandMarket(CONFIG);
    const reader = toWorldStateReader(world);

    expect(market.quote('Wood', 1, reader)).toBeCloseTo(CONFIG.minRatio, 10);
  });

  it('liefert bei völlig leeren Beständen einen endlichen, geklemmten Preis (keine Division durch 0)', () => {
    const world = buildTestWorld();
    addPerson(world);
    const market = new SupplyDemandMarket(CONFIG);
    const reader = toWorldStateReader(world);

    const price = market.quote('Wood', 10, reader);
    expect(Number.isFinite(price)).toBe(true);
  });
});

describe('SupplyDemandMarket.trade() — Ausführungssemantik entspricht FixedRatioMarket', () => {
  it('führt einen erfolgreichen Tausch durch und aktualisiert beide Inventare konsistent zum quotierten Preis', () => {
    const world = buildTestWorld();
    const seller = addPerson(world);
    const buyer = addPerson(world);
    world.components.inventory.get(seller)!.amounts.Food = 50;
    world.components.inventory.get(buyer)!.amounts.Wood = 50;
    const market = new SupplyDemandMarket(CONFIG);

    const result = market.trade(buyer, seller, 'Food', 10, world);

    expect(result.success).toBe(true);
    expect(world.components.inventory.get(seller)!.amounts.Food).toBe(40);
    expect(world.components.inventory.get(buyer)!.amounts.Food).toBe(10);
    expect(world.components.inventory.get(buyer)!.amounts.Wood).toBe(50 - result.price);
    expect(world.components.inventory.get(seller)!.amounts.Wood).toBe(result.price);
  });

  it('lehnt einen Tausch ohne Teilausführung ab, wenn der Käufer nicht genug Gegenwert besitzt', () => {
    const world = buildTestWorld();
    const seller = addPerson(world);
    const buyer = addPerson(world);
    world.components.inventory.get(seller)!.amounts.Food = 50;
    world.components.inventory.get(buyer)!.amounts.Wood = 0;
    const market = new SupplyDemandMarket(CONFIG);

    const result = market.trade(buyer, seller, 'Food', 10, world);

    expect(result.success).toBe(false);
    expect(result.amountTraded).toBe(0);
    expect(world.components.inventory.get(seller)!.amounts.Food).toBe(50);
    expect(world.components.inventory.get(buyer)!.amounts.Wood).toBe(0);
  });
});

describe('SupplyDemandMarket vs. FixedRatioMarket', () => {
  it('liefert bei asymmetrischen Beständen einen anderen Preis als eine feste Ratio von 1', () => {
    const world = buildTestWorld();
    const a = addPerson(world);
    world.components.inventory.get(a)!.amounts.Food = 25;
    world.components.inventory.get(a)!.amounts.Wood = 100;
    const reader = toWorldStateReader(world);

    const supplyDemand = new SupplyDemandMarket(CONFIG);
    const fixed = new FixedRatioMarket(1);

    expect(supplyDemand.quote('Wood', 10, reader)).not.toBeCloseTo(fixed.quote('Wood', 10, reader), 5);
  });
});
