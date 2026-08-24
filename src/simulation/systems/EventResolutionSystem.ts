import type { WorldState } from '../../world/WorldState.js';

// EventResolutionSystem (Subtask 2 §5/§7, Resolution 2., letztes
// Domänensystem): überführt die während des Ticks gesammelten Events in die
// begrenzte EventHistory. Anhängereihenfolge entspricht der Emissionsreihen-
// folge (feste Systemreihenfolge während des Ticks).
export function runEventResolutionSystem(world: WorldState): void {
  for (const event of world.events.pending) {
    world.events.history.push(event);
  }
  world.events.pending.length = 0;
}
