import { SEASONS } from '../../domain/value-objects/enums.js';
import type { WorldState } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';

// TimeSystem (Subtask 2 §5, Perception 1.): leitet Jahreszeit aus
// clock.currentTick ab, erkennt Jahreszeitenwechsel. Keine
// Determinismus-Risiken (reine Arithmetik).
export function runTimeSystem(world: WorldState, ctx: TickContext): void {
  const day = Math.floor(world.clock.currentTick / ctx.config.ticksPerDay);
  const seasonIndex = Math.floor(day / ctx.config.daysPerSeason) % SEASONS.length;
  const newSeason = SEASONS[seasonIndex]!;

  if (newSeason !== world.environment.season) {
    world.environment.season = newSeason;
    ctx.emit({ type: 'SeasonChangedEvent', season: newSeason });
  }
}
