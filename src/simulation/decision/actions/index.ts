import type { SimulationConfig } from '../../../config/schema.js';
import type { Market } from '../../economy/Market.js';
import type { Action } from '../Action.js';
import { createEatAction } from './Eat.js';
import { createSleepAction } from './Sleep.js';
import { createSocializeAction } from './Socialize.js';
import { createWorkAction } from './Work.js';
import { createTradeAction } from './Trade.js';
import { createCareAction } from './Care.js';

export { createEatAction, createSleepAction, createSocializeAction, createWorkAction, createTradeAction, createCareAction };

// Feste Menge an Actions (Subtask 3 §20 Punkt 5: Annahme, aktuell fest im
// Code definiert). Neue Handlung = neue Datei hier ergänzt, kein bestehendes
// System geändert (02 §5/§9). v2, Subtask 9 §12: Care ergänzt (Kinder-
// Versorgung); Work/Trade erhalten zusätzlich minAdultAgeTicks (V2-I3).
export function createBaselineActions(config: SimulationConfig, market: Market): Action[] {
  return [
    createEatAction(config.actions),
    createSleepAction(config.actions),
    createSocializeAction(config.actions),
    createWorkAction({ ...config.actions, minAdultAgeTicks: config.reproduction.minAdultAgeTicks }),
    createTradeAction({ ...config.actions, minAdultAgeTicks: config.reproduction.minAdultAgeTicks }, market),
    createCareAction({ ...config.actions, minAdultAgeTicks: config.reproduction.minAdultAgeTicks }),
  ];
}
