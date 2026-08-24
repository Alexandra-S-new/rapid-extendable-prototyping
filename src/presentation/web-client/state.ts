// state.ts (Subtask 23 §19/§27, erweitert Subtask 24 §7/§9/§12/§13): reiner,
// präsentationsseitiger UI-Zustand — Navigation, Event-Filter, Beobachtungs-
// ("Follow"-)Auswahl. Lebt ausschließlich im Browser — niemals im
// WorldState, SaveFile oder SimulationController (Subtask 22 §26.7). Reine
// Funktionen, ohne DOM-/Netzwerkzugriff, daher isoliert testbar (§21).
//
// Bewusste Trennung (Subtask 24 §12/§13): Navigation (view/history) und die
// beiden cross-cutting Zustände (eventFilter/knownEventTypes,
// followedPersonId) sind unabhängig voneinander — "Zur Welt" oder eine neue
// Auswahl darf einen laufenden Event-Filter oder eine aktive Beobachtung
// nicht stillschweigend zurücksetzen, und umgekehrt.

export type View =
  | { readonly kind: 'world' }
  | { readonly kind: 'location'; readonly id: number }
  | { readonly kind: 'person'; readonly id: number }
  | { readonly kind: 'animal'; readonly id: number };

export interface UiState {
  readonly view: View;
  readonly history: readonly View[];
  readonly followedPersonId: number | null;
  readonly eventFilter: ReadonlySet<string>; // leer = kein Filter, alle Typen sichtbar
  readonly knownEventTypes: ReadonlySet<string>; // dynamisch aus tatsächlich gesehenen Events akkumuliert (Subtask 24 §8) — keine hartcodierte Taxonomie
}

export function initialState(): UiState {
  return { view: { kind: 'world' }, history: [], followedPersonId: null, eventFilter: new Set(), knownEventTypes: new Set() };
}

export function navigateTo(state: UiState, view: View): UiState {
  if (viewsEqual(state.view, view)) return state;
  return { ...state, view, history: [...state.history, state.view] };
}

export function navigateBack(state: UiState): UiState {
  if (state.history.length === 0) return { ...state, view: { kind: 'world' }, history: [] };
  const view = state.history[state.history.length - 1]!;
  return { ...state, view, history: state.history.slice(0, -1) };
}

// goHome (Subtask 24 §13): direkte Rückkehr zur Weltübersicht aus jeder
// Detailtiefe, unabhängig von der Historienlänge — im Unterschied zu
// navigateBack (ein Schritt zurück) springt dies immer auf die Startseite.
export function goHome(state: UiState): UiState {
  return { ...state, view: { kind: 'world' }, history: [] };
}

// applyLoadRevalidation (Subtask 23 §23, erweitert Subtask 24 §19): nach
// einem Load ist der neue WorldSnapshot die einzige Wahrheit — eine
// Auswahl/Beobachtung, die darin nicht mehr existiert, wird nicht
// stillschweigend weiter angezeigt.
export function applyLoadRevalidation(state: UiState, currentSelectionStillExists: boolean): UiState {
  if (state.view.kind === 'world') return state;
  return currentSelectionStillExists ? state : { ...state, view: { kind: 'world' }, history: [] };
}

export function followPerson(state: UiState, id: number): UiState {
  return { ...state, followedPersonId: id };
}

export function unfollowPerson(state: UiState): UiState {
  if (state.followedPersonId === null) return state;
  return { ...state, followedPersonId: null };
}

// applyFollowRevalidation (Subtask 24 §10/§19): eine beobachtete Person, die
// nach einem Load nicht mehr existiert, wird automatisch nicht mehr
// beobachtet — unabhängig davon, ob gerade diese Person auch der aktuelle
// View war (das regelt applyLoadRevalidation getrennt).
export function applyFollowRevalidation(state: UiState, followedStillExists: boolean): UiState {
  if (state.followedPersonId === null || followedStillExists) return state;
  return { ...state, followedPersonId: null };
}

// resetForNewWorld (Subtask 25 §9.4): nach einem Neustart ist NICHT nur die
// aktuelle Auswahl ggf. ungültig wie bei Load (§19) — Entity-IDs beginnen in
// der neuen Welt wieder bei 1, sodass eine alte ID zufällig auch in der
// neuen Welt "existieren" könnte, dort aber eine völlig andere Entity
// bezeichnet. Ein bloßer Existenz-Check (wie applyLoadRevalidation) wäre
// hier deshalb unsicher — Auswahl und Beobachtung werden nach einem
// Neustart daher IMMER bedingungslos verworfen, nicht nur bei
// Nichtexistenz. Event-Filter/bekannte Eventtypen bleiben bewusst erhalten
// (reine UI-Präferenz, unabhängig davon, welche konkrete Welt läuft).
export function resetForNewWorld(state: UiState): UiState {
  return { ...state, view: { kind: 'world' }, history: [], followedPersonId: null };
}

// describeFollowChange (Subtask 25 §8): reine Diff-Funktion für die
// optionale, kompakte "zeitliche Entwicklung" der beobachteten Person —
// vergleicht zwei bereits vom Server abgerufene Momentaufnahmen (kein neuer
// Zustand, keine Architekturkomplexität) und beschreibt nur eine
// tatsächlich eingetretene Veränderung. null, wenn es (noch) keine
// Vorher-Momentaufnahme gibt oder sich nichts Nennenswertes geändert hat.
export interface FollowSnapshot {
  readonly locationId: number;
  readonly activityLabel: string;
}

export function describeFollowChange(previous: FollowSnapshot | null, next: FollowSnapshot, tick: number): string | null {
  if (previous === null) return null;
  const changes: string[] = [];
  if (previous.locationId !== next.locationId) changes.push(`Ort → #${next.locationId}`);
  if (previous.activityLabel !== next.activityLabel) changes.push(`Aktivität → ${next.activityLabel}`);
  if (changes.length === 0) return null;
  return `Tick ${tick}: ${changes.join(', ')}`;
}

export function recordEventTypes(state: UiState, types: readonly string[]): UiState {
  if (types.length === 0) return state;
  const next = new Set(state.knownEventTypes);
  let changed = false;
  for (const type of types) {
    if (!next.has(type)) {
      next.add(type);
      changed = true;
    }
  }
  return changed ? { ...state, knownEventTypes: next } : state;
}

export function toggleEventTypeFilter(state: UiState, type: string): UiState {
  const next = new Set(state.eventFilter);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  return { ...state, eventFilter: next };
}

export function clearEventFilter(state: UiState): UiState {
  if (state.eventFilter.size === 0) return state;
  return { ...state, eventFilter: new Set() };
}

export function passesEventFilter(state: UiState, type: string): boolean {
  return state.eventFilter.size === 0 || state.eventFilter.has(type);
}

function viewsEqual(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'world' || b.kind === 'world') return true;
  return (a as { id: number }).id === (b as { id: number }).id;
}
