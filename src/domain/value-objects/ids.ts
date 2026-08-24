// Branded ID types (Subtask 2 §3 / Subtask 3 §3.1).
// Branding prevents accidental mixing of different ID kinds at compile time
// at zero runtime cost.

export type EntityId = number & { readonly __brand: 'EntityId' };
export type LocationId = number & { readonly __brand: 'LocationId' };
export type BuildingId = number & { readonly __brand: 'BuildingId' };
export type ActionId = string & { readonly __brand: 'ActionId' };

export function asEntityId(value: number): EntityId {
  return value as EntityId;
}

export function asLocationId(value: number): LocationId {
  return value as LocationId;
}

export function asBuildingId(value: number): BuildingId {
  return value as BuildingId;
}

export function asActionId(value: string): ActionId {
  return value as ActionId;
}

// 0 is reserved as "no entity" (Subtask 2 §3) — never assigned by EntityRegistry.
export const NO_ENTITY: EntityId = asEntityId(0);
