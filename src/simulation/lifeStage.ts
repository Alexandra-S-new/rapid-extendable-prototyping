import { deriveLifeStage } from '../domain/components/age.js';
import type { EntityId } from '../domain/value-objects/ids.js';
import type { WorldStateReader } from '../world/WorldState.js';

// isAdult (v2, Subtask 9 §8.3/V2-I3): wiederverwendet das bereits in v1
// existierende, bislang ungenutzte deriveLifeStage()/minAdultAgeTicks.
// Fehlt die Age-Component (sollte nicht vorkommen), wird konservativ
// 'child' angenommen (canExecute darf dann nicht auf ein fehlendes Age
// spekulieren).
export function isAdult(entityId: EntityId, world: WorldStateReader, minAdultAgeTicks: number): boolean {
  const age = world.components.age.get(entityId);
  if (!age) return false;
  return deriveLifeStage(age, minAdultAgeTicks) === 'adult';
}
