import type { LocationId } from '../value-objects/ids.js';

// Position (Subtask 2 §3, Subtask 3 §5.2): locationId bezeichnet den
// aktuellen bzw. — während einer Reise — den zuletzt verlassenen Ort.
// Der eigentliche Reisezustand (Ziel, Pfad, Fortschritt) lebt vollständig in
// AIState.currentActivity (Traveling), siehe 02 §10 — hier keine Duplikation.
export interface Position {
  locationId: LocationId;
}
