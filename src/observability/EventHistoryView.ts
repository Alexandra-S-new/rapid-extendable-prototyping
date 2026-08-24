import type { WorldStateReader } from '../world/WorldState.js';
import type { SimEvent, SimEventType } from '../domain/events.js';

// EventHistoryView (Subtask 2 §14): rein lesende Sicht auf die Event-History
// — Hauptwerkzeug, um emergentes Verhalten nachträglich zu erklären.
export function queryEventHistory(
  world: WorldStateReader,
  options: { last?: number; type?: SimEventType } = {},
): SimEvent[] {
  let events = world.events.history.toArray();
  if (options.type) {
    events = events.filter((e) => e.type === options.type);
  }
  if (options.last !== undefined) {
    events = events.slice(-options.last);
  }
  return events;
}

export function findEvent(world: WorldStateReader, sequence: number): SimEvent | undefined {
  return world.events.history.toArray().find((e) => e.sequence === sequence);
}
