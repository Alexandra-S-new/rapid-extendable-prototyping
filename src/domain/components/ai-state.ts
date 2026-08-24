import type { ActionId, LocationId } from '../value-objects/ids.js';

// AIState (Subtask 2 §3/§9, Subtask 3 §11.1): FSM-Ausführungszustand der
// Utility-AI. Nur DecisionSystem/MovementSystem/ActionExecutionSystem dürfen
// dies verändern (Invariante I7).
export interface ActivityIdle {
  readonly kind: 'Idle';
}

export interface ActivityTraveling {
  readonly kind: 'Traveling';
  readonly destination: LocationId;
  readonly path: readonly LocationId[];
  nextHopIndex: number;
  ticksRemainingInHop: number;
}

export interface ActivityPerforming {
  readonly kind: 'Performing';
  readonly actionId: ActionId;
  ticksInAction: number;
}

export type Activity = ActivityIdle | ActivityTraveling | ActivityPerforming;

export interface AIState {
  currentActivity: Activity;
}

export const IDLE_ACTIVITY: ActivityIdle = { kind: 'Idle' };
