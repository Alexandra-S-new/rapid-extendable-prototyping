import { asActionId } from '../../../domain/value-objects/ids.js';
import { clampNeed } from '../../clamp.js';
import type { Action } from '../Action.js';

// Sleep (Subtask 3 §6): keine Ressourcenvoraussetzung, gilt für Person und
// Animal generisch (beide haben Needs.energy).
export function createSleepAction(config: { sleepRestorePerTick: number }): Action {
  return {
    id: asActionId('Sleep'),
    minTicks: 4,

    canExecute() {
      return true;
    },

    score(entityId, world) {
      const needs = world.components.needs.get(entityId);
      if (!needs) return 0;
      return (100 - needs.energy) / 100;
    },

    execute(entityId, world) {
      const needs = world.components.needs.get(entityId);
      if (!needs) return { done: true };
      needs.energy = clampNeed(needs.energy + config.sleepRestorePerTick);
      return { done: needs.energy >= 100 };
    },
  };
}
