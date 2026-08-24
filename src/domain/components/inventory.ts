import type { ResourceType } from '../value-objects/enums.js';

// Inventory (Subtask 2 §3, Subtask 3 §4.2): nur Person — Animal besitzt
// keinen Eintrag im Inventory-ComponentStore.
export interface Inventory {
  amounts: Record<ResourceType, number>;
}
