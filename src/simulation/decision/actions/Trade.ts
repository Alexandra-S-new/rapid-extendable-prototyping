import { asActionId, type EntityId, type LocationId } from '../../../domain/value-objects/ids.js';
import type { ResourceType } from '../../../domain/value-objects/enums.js';
import type { WorldState, WorldStateReader } from '../../../world/WorldState.js';
import type { Action } from '../Action.js';
import type { Market } from '../../economy/Market.js';
import { isAdult } from '../../lifeStage.js';

// Trade (Subtask 2 §11, Subtask 3 §10, Subtask 4 Korrektur/ADR-14): ruft die
// Market-Abstraktion auf, sobald die Person an einem Market-Gebäude
// eingetroffen ist. Peer-to-Peer zwischen zwei Personen (Market.trade nimmt
// buyer+seller als EntityId, 02 §11) — Gegenpartei wird deterministisch über
// die niedrigste passende EntityId am selben Ort gesucht (Subtask 3 §12:
// Konfliktauflösung über EntityId-Sortierung).
//
// Korrektur (Subtask 4, ADR-14 in 02): canExecute() prüfte ursprünglich
// bereits Anwesenheit — dadurch konnte der requiredLocation-Reisemechanismus
// aus 02 §9 Schritt 4 nie greifen (nur bereits-canExecute-fähige Actions
// werden als "best" gewählt). Jetzt: canExecute() prüft nur grundsätzliche
// Erreichbarkeit (Marktgebäude existiert, eigener Überschuss vorhanden);
// requiredLocation() liefert den Zielort; execute() bleibt ortsgebunden und
// ist die einzige Stelle, die tatsächliche Anwesenheit voraussetzt.

function marketLocations(world: WorldStateReader): LocationId[] {
  return world.environment.buildings.filter((b) => b.kind === 'Market').map((b) => b.locationId);
}

function isAtMarket(entityId: EntityId, world: WorldStateReader): boolean {
  const position = world.components.position.get(entityId);
  if (!position) return false;
  return marketLocations(world).includes(position.locationId);
}

// self verkauft `resource`, wenn er mehr davon besitzt als vom jeweils
// anderen Rohstoff — deterministisch, kein Zufall nötig für die Rollenwahl.
function surplusResource(amounts: Record<ResourceType, number>): ResourceType | undefined {
  if (amounts.Food === 0 && amounts.Wood === 0) return undefined;
  return amounts.Food >= amounts.Wood ? 'Food' : 'Wood';
}

function hasTradeableSurplus(entityId: EntityId, world: WorldStateReader, tradeAmount: number): boolean {
  const inventory = world.components.inventory.get(entityId);
  if (!inventory) return false;
  const resource = surplusResource(inventory.amounts);
  return resource !== undefined && inventory.amounts[resource] >= tradeAmount;
}

// Deterministische Zielwahl: bleibe am aktuellen Ort, falls dort bereits ein
// Market-Gebäude existiert; sonst niedrigste LocationId unter den
// Market-Standorten (einfacher, deterministischer Tie-Break).
function chooseTradeTarget(entityId: EntityId, world: WorldStateReader): LocationId | undefined {
  const position = world.components.position.get(entityId);
  if (!position) return undefined;
  const markets = marketLocations(world);
  if (markets.length === 0) return undefined;
  if (markets.includes(position.locationId)) return position.locationId;
  return [...markets].sort((a, b) => a - b)[0];
}

function findCounterparty(
  entityId: EntityId,
  world: WorldStateReader,
  tradeAmount: number,
): { partner: EntityId; resource: ResourceType } | undefined {
  const position = world.components.position.get(entityId);
  const selfInventory = world.components.inventory.get(entityId);
  if (!position || !selfInventory) return undefined;
  const selfResource = surplusResource(selfInventory.amounts);
  if (selfResource === undefined || selfInventory.amounts[selfResource] < tradeAmount) return undefined;
  const otherResource: ResourceType = selfResource === 'Food' ? 'Wood' : 'Food';

  const candidates = [...world.entities.alive].filter((id) => id !== entityId).sort((a, b) => a - b);
  for (const candidateId of candidates) {
    const candidatePosition = world.components.position.get(candidateId);
    if (!candidatePosition || candidatePosition.locationId !== position.locationId) continue;
    const candidateInventory = world.components.inventory.get(candidateId);
    if (!candidateInventory) continue;
    if (candidateInventory.amounts[otherResource] >= tradeAmount) {
      return { partner: candidateId, resource: selfResource };
    }
  }
  return undefined;
}

export function createTradeAction(config: { tradeAmountPerTrade: number; minAdultAgeTicks: number }, market: Market): Action {
  return {
    id: asActionId('Trade'),
    minTicks: 1,

    canExecute(entityId, world) {
      if (!world.components.inventory.get(entityId)) return false;
      // v2, Subtask 9 §8.3 (V2-I3): Kinder haben ohnehin kein eigenes
      // Einkommen (kein Work), aber das Gate wird zur Klarheit/Konsistenz
      // explizit auch hier gesetzt statt implizit über leere Inventare.
      if (!isAdult(entityId, world, config.minAdultAgeTicks)) return false;
      if (!hasTradeableSurplus(entityId, world, config.tradeAmountPerTrade)) return false;
      return chooseTradeTarget(entityId, world) !== undefined;
    },

    score(entityId, world) {
      return hasTradeableSurplus(entityId, world, config.tradeAmountPerTrade) && chooseTradeTarget(entityId, world) !== undefined ? 0.2 : 0;
    },

    requiredLocation(entityId, world) {
      return chooseTradeTarget(entityId, world);
    },

    execute(entityId: EntityId, world: WorldState) {
      if (!isAtMarket(entityId, world)) return { done: true };
      const match = findCounterparty(entityId, world, config.tradeAmountPerTrade);
      if (!match) return { done: true };
      const buyer = match.partner;
      const seller = entityId;
      const result = market.trade(buyer, seller, match.resource, config.tradeAmountPerTrade, world);
      if (!result.success) return { done: true };
      return {
        done: true,
        events: [
          {
            type: 'TradeEvent',
            buyer,
            seller,
            resource: match.resource,
            amount: result.amountTraded,
            price: result.price,
          },
        ],
      };
    },
  };
}
