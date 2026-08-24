import { hasSocialNeed } from '../../domain/components/needs.js';
import { clampNeed } from '../clamp.js';
import type { WorldState } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';

// NeedsSystem (Subtask 2 §5, Perception 4.): Bedürfnis-Zerfall pro Tick.
// Wendet den Zerfall nur auf tatsächlich vorhandene Needs-Felder an
// (Subtask 3.6b) — social nur, wenn 'social' in needs (Person).
// Iteration zwingend nach EntityId sortiert (world.entities.alive).
export function runNeedsSystem(world: WorldState, ctx: TickContext): void {
  for (const entityId of world.entities.alive) {
    const needs = world.components.needs.get(entityId);
    if (!needs) continue;

    needs.hunger = clampNeed(needs.hunger - ctx.config.needs.hungerDecayPerTick);
    needs.energy = clampNeed(needs.energy - ctx.config.needs.energyDecayPerTick);
    if (hasSocialNeed(needs)) {
      needs.social = clampNeed(needs.social - ctx.config.needs.socialDecayPerTick);
    }
  }
}
