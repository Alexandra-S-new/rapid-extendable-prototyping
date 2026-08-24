import { IDLE_ACTIVITY } from '../../domain/components/ai-state.js';
import type { WorldState } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';
import { travelTicksBetween } from '../travel.js';

// MovementSystem (Subtask 2 §5, Action 1.): bewegt reisende Agenten entlang
// des vorab berechneten Pfades. Position.locationId bleibt während der
// gesamten Reise am zuletzt verlassenen Ort (Subtask 3 §5.2, Invariante I3)
// — wird ausschließlich bei finaler Ankunft aktualisiert, nie pro Hop.
export function runMovementSystem(world: WorldState, ctx: TickContext): void {
  for (const entityId of world.entities.alive) {
    const aiState = world.components.aiState.get(entityId);
    if (!aiState || aiState.currentActivity.kind !== 'Traveling') continue;
    const activity = aiState.currentActivity;
    const position = world.components.position.get(entityId);
    if (!position) continue;

    activity.ticksRemainingInHop -= 1;
    if (activity.ticksRemainingInHop > 0) continue;

    const arrivedHopLocation = activity.path[activity.nextHopIndex]!;

    if (activity.nextHopIndex === activity.path.length - 1) {
      const fromLocation = position.locationId;
      position.locationId = arrivedHopLocation;
      aiState.currentActivity = IDLE_ACTIVITY;
      ctx.emit({ type: 'MovementEvent', entityId, fromLocation, toLocation: arrivedHopLocation });
    } else {
      const nextIndex = activity.nextHopIndex + 1;
      const nextTarget = activity.path[nextIndex]!;
      activity.ticksRemainingInHop = travelTicksBetween(world, arrivedHopLocation, nextTarget);
      activity.nextHopIndex = nextIndex;
    }
  }
}
