import { asActionId } from '../../../domain/value-objects/ids.js';
import { hasSocialNeed } from '../../../domain/components/needs.js';
import { clampNeed } from '../../clamp.js';
import type { Action } from '../Action.js';

// Socialize (Subtask 2 §3, Subtask 3.6b, verbindlich): canExecute() liefert
// für Animal stets false — kein künstliches social-Feld für Animal.
export function createSocializeAction(config: { socializeRestorePerTick: number }): Action {
  return {
    id: asActionId('Socialize'),
    minTicks: 2,

    canExecute(entityId, world) {
      const needs = world.components.needs.get(entityId);
      return needs !== undefined && hasSocialNeed(needs);
    },

    score(entityId, world) {
      const needs = world.components.needs.get(entityId);
      if (!needs || !hasSocialNeed(needs)) return 0;
      return (100 - needs.social) / 100;
    },

    execute(entityId, world) {
      const needs = world.components.needs.get(entityId);
      if (!needs || !hasSocialNeed(needs)) return { done: true };
      needs.social = clampNeed(needs.social + config.socializeRestorePerTick);
      return { done: needs.social >= 100 };
    },
  };
}
