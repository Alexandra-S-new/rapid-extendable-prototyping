import { asActionId, type EntityId } from '../../../domain/value-objects/ids.js';
import type { LocationId } from '../../../domain/value-objects/ids.js';
import type { WorldState, WorldStateReader } from '../../../world/WorldState.js';
import type { Action } from '../Action.js';
import { isAdult } from '../../lifeStage.js';

// Care (v2, Subtask 9 §4/ADR-V2-01): Kinder-Versorgung. Ausschließlich
// Person. ADR-14-konform: canExecute prüft nur grundsätzliche Erreichbarkeit
// (ein lebendes, bedürftiges Kind existiert irgendwo, Elternteil hat Food);
// requiredLocation liefert das Ziel; execute prüft tatsächliche Anwesenheit
// (V2-I8). Priorisiert, nicht erzwungen — konkurriert rein über score() wie
// jede andere Action (Subtask 9 §4, bewusst kein künstlicher Prioritäts-Bonus).

interface NeedyChild {
  id: EntityId;
  locationId: LocationId;
  hunger: number;
}

// Bedürftigstes (niedrigster hunger), co-erreichbares lebendes Kind unter
// den eigenen Relationships.childIds — Tie-Break niedrigste EntityId, rein
// deterministisch, kein RNG (Subtask 9 §14).
function findNeediestChild(parentId: EntityId, world: WorldStateReader, minAdultAgeTicks: number): NeedyChild | undefined {
  const relationships = world.components.relationships.get(parentId);
  if (!relationships) return undefined;

  let best: NeedyChild | undefined;
  for (const childId of [...relationships.childIds].sort((a, b) => a - b)) {
    if (!world.components.identity.has(childId)) continue; // verstorben
    if (isAdult(childId, world, minAdultAgeTicks)) continue; // längst erwachsen
    const needs = world.components.needs.get(childId);
    const position = world.components.position.get(childId);
    if (!needs || !position) continue;
    if (needs.hunger >= 100) continue; // kein Bedarf
    if (!best || needs.hunger < best.hunger) {
      best = { id: childId, locationId: position.locationId, hunger: needs.hunger };
    }
  }
  return best;
}

export function createCareAction(config: { careTransferPerTick: number; minAdultAgeTicks: number }): Action {
  return {
    id: asActionId('Care'),
    minTicks: 1,

    canExecute(entityId, world) {
      const inventory = world.components.inventory.get(entityId);
      if (!inventory || inventory.amounts.Food <= 0) return false; // nur Person mit Food
      return findNeediestChild(entityId, world, config.minAdultAgeTicks) !== undefined;
    },

    score(entityId, world) {
      const child = findNeediestChild(entityId, world, config.minAdultAgeTicks);
      if (!child) return 0;
      return (100 - child.hunger) / 100;
    },

    requiredLocation(entityId, world) {
      return findNeediestChild(entityId, world, config.minAdultAgeTicks)?.locationId;
    },

    execute(entityId: EntityId, world: WorldState) {
      const child = findNeediestChild(entityId, world, config.minAdultAgeTicks);
      const parentPosition = world.components.position.get(entityId);
      const parentInventory = world.components.inventory.get(entityId);
      if (!child || !parentPosition || !parentInventory) return { done: true };
      // V2-I8: tatsächliche Anwesenheit ist Ausführungsvoraussetzung.
      if (parentPosition.locationId !== child.locationId) return { done: true };

      const childNeeds = world.components.needs.get(child.id);
      if (!childNeeds) return { done: true };

      const transferred = Math.min(parentInventory.amounts.Food, config.careTransferPerTick);
      parentInventory.amounts.Food -= transferred;
      childNeeds.hunger = Math.min(100, childNeeds.hunger + transferred);
      return { done: true };
    },
  };
}
