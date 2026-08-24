import { commitRemovals } from '../../world/EntityRegistry.js';
import type { WorldState } from '../../world/WorldState.js';

// CleanupSystem (Subtask 2 §5, letzte Phase): entfernt als tot markierte
// Entities endgültig aus Registry und allen Component Stores.
export function runCleanupSystem(world: WorldState): void {
  commitRemovals(world);
}
