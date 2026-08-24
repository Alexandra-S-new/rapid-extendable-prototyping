import { asActionId } from '../../../domain/value-objects/ids.js';
import { clampNeed } from '../../clamp.js';
import type { Action } from '../Action.js';

// Eat (Subtask 3 §4.2, §10, §16): Person konsumiert Food aus eigenem
// Inventory; Animal "grast" direkt am Ort ohne Bestand zu halten (kein
// Inventory-Zugriff, keine Ortsvoraussetzung).
export function createEatAction(config: {
  eatRestorePerTick: number;
  grazeRestorePerTick: number;
}): Action {
  return {
    id: asActionId('Eat'),
    minTicks: 2,

    canExecute(entityId, world) {
      const identity = world.components.identity.get(entityId);
      if (!identity) return false;
      if (identity.kind === 'animal') return true; // Grasen ist immer möglich
      const inventory = world.components.inventory.get(entityId);
      return (inventory?.amounts.Food ?? 0) > 0;
    },

    score(entityId, world) {
      const needs = world.components.needs.get(entityId);
      if (!needs) return 0;
      return (100 - needs.hunger) / 100;
    },

    execute(entityId, world, _rng) {
      const identity = world.components.identity.get(entityId);
      const needs = world.components.needs.get(entityId);
      if (!identity || !needs) return { done: true };

      if (identity.kind === 'animal') {
        needs.hunger = clampNeed(needs.hunger + config.grazeRestorePerTick);
        return { done: needs.hunger >= 100 };
      }

      const inventory = world.components.inventory.get(entityId);
      if (!inventory) return { done: true };
      const consumed = Math.min(inventory.amounts.Food, config.eatRestorePerTick);
      inventory.amounts.Food -= consumed;
      needs.hunger = clampNeed(needs.hunger + consumed);
      return { done: consumed === 0 || needs.hunger >= 100 };
    },
  };
}
