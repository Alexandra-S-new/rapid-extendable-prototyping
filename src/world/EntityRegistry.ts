import { asEntityId, type EntityId } from '../domain/value-objects/ids.js';
import type { WorldState } from './WorldState.js';

// EntityRegistry (Subtask 2 §3/§4): einzige legitime Stelle für
// Entity-Erzeugung/-Entfernung. Keine ID-Wiederverwendung (ADR-13).

export function createEntity(world: WorldState): EntityId {
  const id = asEntityId(world.entities.nextEntityId);
  world.entities.nextEntityId = asEntityId(id + 1);
  insertSorted(world.entities.alive, id);
  return id;
}

export function markForRemoval(world: WorldState, entityId: EntityId): void {
  if (!world.entities.pendingRemovals.includes(entityId)) {
    world.entities.pendingRemovals.push(entityId);
  }
}

// Entfernt alle als tot markierten Entities endgültig aus Registry und allen
// Component Stores (CleanupSystem, Subtask 2 §5).
export function commitRemovals(world: WorldState): void {
  const removals = [...world.entities.pendingRemovals].sort((a, b) => a - b);
  for (const id of removals) {
    removeFromSorted(world.entities.alive, id);
    world.components.identity.delete(id);
    world.components.position.delete(id);
    world.components.needs.delete(id);
    world.components.inventory.delete(id);
    world.components.age.delete(id);
    world.components.aiState.delete(id);
    world.components.relationships.delete(id);
  }
  world.entities.pendingRemovals.length = 0;
}

function insertSorted(sorted: EntityId[], id: EntityId): void {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((sorted[mid] as number) < (id as number)) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  sorted.splice(low, 0, id);
}

function removeFromSorted(sorted: EntityId[], id: EntityId): void {
  const index = sorted.indexOf(id);
  if (index !== -1) {
    sorted.splice(index, 1);
  }
}
