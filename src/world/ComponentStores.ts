import type { EntityId } from '../domain/value-objects/ids.js';
import type {
  Identity,
  Position,
  Needs,
  Inventory,
  Age,
  AIState,
  Relationships,
} from '../domain/components/index.js';

// ComponentStores (Subtask 2 §4): je Componenttyp eine Map<EntityId, Component>.
export interface ComponentStores {
  identity: Map<EntityId, Identity>;
  position: Map<EntityId, Position>;
  needs: Map<EntityId, Needs>;
  inventory: Map<EntityId, Inventory>;
  age: Map<EntityId, Age>;
  aiState: Map<EntityId, AIState>;
  relationships: Map<EntityId, Relationships>;
}

export interface ComponentStoresReader {
  readonly identity: ReadonlyMap<EntityId, Identity>;
  readonly position: ReadonlyMap<EntityId, Position>;
  readonly needs: ReadonlyMap<EntityId, Needs>;
  readonly inventory: ReadonlyMap<EntityId, Inventory>;
  readonly age: ReadonlyMap<EntityId, Age>;
  readonly aiState: ReadonlyMap<EntityId, AIState>;
  readonly relationships: ReadonlyMap<EntityId, Relationships>;
}

export function createComponentStores(): ComponentStores {
  return {
    identity: new Map(),
    position: new Map(),
    needs: new Map(),
    inventory: new Map(),
    age: new Map(),
    aiState: new Map(),
    relationships: new Map(),
  };
}
