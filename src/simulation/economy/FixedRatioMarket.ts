import type { EntityId } from '../../domain/value-objects/ids.js';
import type { ResourceType } from '../../domain/value-objects/enums.js';
import type { WorldState, WorldStateReader } from '../../world/WorldState.js';
import type { Market, TradeResult } from './Market.js';

// FixedRatioMarket (Subtask 2 §11): statisches, konfiguriertes
// Tauschverhältnis zwischen Food und Wood, keine Angebot/Nachfrage-Dynamik.
// ratio = wie viel Food ein 1 Wood wert ist.
// v2: quote() erhält den zusätzlichen world-Parameter (ADR-V2-05), ignoriert
// ihn aber — Verhalten bleibt zu 100% identisch zu v1.
export class FixedRatioMarket implements Market {
  constructor(private readonly ratio: number) {}

  quote(resource: ResourceType, amount: number, _world: WorldStateReader): number {
    return resource === 'Wood' ? amount * this.ratio : amount / this.ratio;
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
