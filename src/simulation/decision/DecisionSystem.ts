import type { WorldState } from '../../world/WorldState.js';
import { toWorldStateReader } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';
import type { Action } from './Action.js';
import { travelTicksBetween } from '../travel.js';

// DecisionSystem (Subtask 2 §5/§9, Subtask 3 §9): wählt für jeden
// entscheidungsbereiten Agenten (AIState.currentActivity.kind === 'Idle')
// die nächste Aktivität via Utility-AI. Iteration streng nach EntityId
// sortiert (world.entities.alive ist sortiert gehalten, Subtask 2 §4).
export function runDecisionSystem(world: WorldState, ctx: TickContext, actions: readonly Action[]): void {
  const reader = toWorldStateReader(world);

  for (const entityId of world.entities.alive) {
    const aiState = world.components.aiState.get(entityId);
    if (!aiState || aiState.currentActivity.kind !== 'Idle') continue;

    const candidates = actions.filter((a) => a.canExecute(entityId, reader));
    if (candidates.length === 0) continue;

    const scored = candidates.map((a) => ({ action: a, score: a.score(entityId, reader) }));
    const topScore = Math.max(...scored.map((s) => s.score));
    const tied = scored.filter((s) => s.score === topScore).sort((a, b) => (a.action.id < b.action.id ? -1 : a.action.id > b.action.id ? 1 : 0));

    const chosen = tied.length === 1 ? tied[0]!.action : tied[pickTieBreakIndex(entityId, ctx, tied.length)]!.action;

    const targetLocation = chosen.requiredLocation?.(entityId, reader);
    const position = world.components.position.get(entityId);

    if (targetLocation !== undefined && position !== undefined && targetLocation !== position.locationId) {
      const path = ctx.pathTable.pathBetween(position.locationId, targetLocation);
      if (path.length === 0) continue; // kein Pfad -> Kandidat faktisch nicht erreichbar, Idle bleibt
      aiState.currentActivity = {
        kind: 'Traveling',
        destination: targetLocation,
        path,
        nextHopIndex: 0,
        ticksRemainingInHop: path[0] !== undefined ? travelTicksBetween(world, position.locationId, path[0]) : 0,
      };
    } else {
      aiState.currentActivity = { kind: 'Performing', actionId: chosen.id, ticksInAction: 0 };
    }
  }
}

function pickTieBreakIndex(entityId: number, ctx: TickContext, count: number): number {
  return ctx.rng.stream('agent-decision', entityId).nextInt(count);
}
