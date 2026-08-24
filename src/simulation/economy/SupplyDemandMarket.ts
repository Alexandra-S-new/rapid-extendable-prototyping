import type { EntityId } from '../../domain/value-objects/ids.js';
import type { ResourceType } from '../../domain/value-objects/enums.js';
import type { WorldState, WorldStateReader } from '../../world/WorldState.js';
import type { Market, TradeResult } from './Market.js';

// SupplyDemandMarket (v2, Subtask 9 §8.4/ADR-V2-05): zweite Market-Strategie
// — dynamische statt fixer Preise, abgeleitet ausschließlich aus bereits in
// WorldState gehaltenen Beständen (kein eigener, separat zu persistierender
// Marktzustand -> kein Determinismus-/Persistenzrisiko nach Save/Load).
// effectiveRatio = clamp((totalWood/totalFood)^elasticity, minRatio, maxRatio)
// — "wie viel Food ein 1 Wood wert ist", analog FixedRatioMarket.
export class SupplyDemandMarket implements Market {
  constructor(private readonly config: { elasticity: number; minRatio: number; maxRatio: number }) {}

  private effectiveRatio(world: WorldStateReader): number {
    const totals = computeResourceTotals(world);
    // Division-durch-Null-Schutz: keine RNG-Beeinflussung, rein numerisch.
    const safeFood = Math.max(totals.Food, 1e-6);
    const safeWood = Math.max(totals.Wood, 1e-6);
    const raw = Math.pow(safeWood / safeFood, this.config.elasticity);
    return Math.min(this.config.maxRatio, Math.max(this.config.minRatio, raw)); // V2-I7
  }

  quote(resource: ResourceType, amount: number, world: WorldStateReader): number {
    const ratio = this.effectiveRatio(world);
    return resource === 'Wood' ? amount * ratio : amount / ratio;
  }

  trade(buyer: EntityId, seller: EntityId, resource: ResourceType, amount: number, world: WorldState): TradeResult {
    const price = this.quote(resource, amount, world);
    const otherResource: ResourceType = resource === 'Food' ? 'Wood' : 'Food';
    const sellerInv = world.components.inventory.get(seller);
    const buyerInv = world.components.inventory.get(buyer);

    if (!sellerInv || !buyerInv) {
      return { success: false, amountTraded: 0, price };
    }
    // Bestand kann nicht überzogen werden (Subtask 3 Invariante I2) — kein
    // partieller Tausch, sonst kein Effekt (03 §10, dokumentierter Randfall).
    if (sellerInv.amounts[resource] < amount || buyerInv.amounts[otherResource] < price) {
      return { success: false, amountTraded: 0, price };
    }

    sellerInv.amounts[resource] -= amount;
    buyerInv.amounts[resource] += amount;
    buyerInv.amounts[otherResource] -= price;
    sellerInv.amounts[otherResource] += price;

    return { success: true, amountTraded: amount, price };
  }
}

function computeResourceTotals(world: WorldStateReader): Record<ResourceType, number> {
  const totals: Record<ResourceType, number> = { Food: 0, Wood: 0 };
  for (const inventory of world.components.inventory.values()) {
    totals.Food += inventory.amounts.Food;
    totals.Wood += inventory.amounts.Wood;
  }
  for (const building of world.environment.buildings) {
    totals.Food += building.inventory.Food;
    totals.Wood += building.inventory.Wood;
  }
  return totals;
}
