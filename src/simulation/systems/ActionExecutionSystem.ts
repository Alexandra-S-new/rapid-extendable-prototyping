import { IDLE_ACTIVITY } from '../../domain/components/ai-state.js';
import type { WorldState } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';
import type { Action } from '../decision/Action.js';

// ActionExecutionSystem (Subtask 2 §5/§9, Action 2.): generischer Dispatcher.
// Kennt die fachliche Wirkung einzelner Actions nicht selbst — ruft nur
// action.execute() auf und leitet zurückgegebene Events generisch weiter.
// done wird erst ab ticksInAction >= minTicks honoriert (Hysterese).
export function runActionExecutionSystem(world: WorldState, ctx: TickContext, actionsById: ReadonlyMap<string, Action>): void {
  for (const entityId of world.entities.alive) {
    const aiState = world.components.aiState.get(entityId);
    if (!aiState || aiState.currentActivity.kind !== 'Performing') continue;
    const activity = aiState.currentActivity;

    const action = actionsById.get(activity.actionId);
    if (!action) continue;

    const rng = ctx.rng.stream('agent-action', entityId);
    const result = action.execute(entityId, world, rng);
    activity.ticksInAction += 1;

    for (const event of result.events ?? []) {
      ctx.emit(event);
    }

    if (result.done && activity.ticksInAction >= action.minTicks) {
      aiState.currentActivity = IDLE_ACTIVITY;
    }
  }
}
