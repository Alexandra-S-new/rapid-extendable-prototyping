import type { EntityId } from '../../domain/value-objects/ids.js';
import type { ResourceType } from '../../domain/value-objects/enums.js';
import type { WorldState, WorldStateReader } from '../../world/WorldState.js';

// Market (Subtask 2 §11): austauschbare Tausch-Strategie.
export interface TradeResult {
  success: boolean;
  amountTraded: number;
  price: number;
}

// v2, Subtask 9 §8.4/ADR-V2-05: quote() um WorldStateReader erweitert, damit
// eine Angebot/Nachfrage-Strategie den Preis aus aktuellen WorldState-
// Beständen ableiten kann, ohne eigenen, nicht in WorldState gehaltenen
// (und damit Save/Load-riskanten) Marktzustand zu benötigen. Signatur-
// Änderung, keine Verhaltensänderung von FixedRatioMarket (verifiziert:
// quote() wird v1-weit ausschließlich intern von FixedRatioMarket selbst
// aufgerufen, kein externer Aufrufer betroffen).
export interface Market {
  quote(resource: ResourceType, amount: number, world: WorldStateReader): number; // pure, deterministisch
  trade(buyer: EntityId, seller: EntityId, resource: ResourceType, amount: number, world: WorldState): TradeResult;
}
