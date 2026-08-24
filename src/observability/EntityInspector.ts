import type { WorldStateReader } from '../world/WorldState.js';
import type { EntityId } from '../domain/value-objects/ids.js';

// EntityInspector (Subtask 1 §5.5, Subtask 2 §14): vollständiger
// Komponentenzustand einer Entity zum aktuellen Tick — rein lesend.
export interface EntitySnapshot {
  entityId: EntityId;
  identity: ReturnType<WorldStateReader['components']['identity']['get']>;
  position: ReturnType<WorldStateReader['components']['position']['get']>;
  needs: ReturnType<WorldStateReader['components']['needs']['get']>;
  inventory: ReturnType<WorldStateReader['components']['inventory']['get']>;
  age: ReturnType<WorldStateReader['components']['age']['get']>;
  aiState: ReturnType<WorldStateReader['components']['aiState']['get']>;
  relationships: ReturnType<WorldStateReader['components']['relationships']['get']>;
}

export function inspectEntity(world: WorldStateReader, entityId: EntityId): EntitySnapshot | undefined {
  if (!world.components.identity.has(entityId)) return undefined;
  return {
    entityId,
    identity: world.components.identity.get(entityId),
    position: world.components.position.get(entityId),
    needs: world.components.needs.get(entityId),
    inventory: world.components.inventory.get(entityId),
    age: world.components.age.get(entityId),
    aiState: world.components.aiState.get(entityId),
    relationships: world.components.relationships.get(entityId),
  };
}
