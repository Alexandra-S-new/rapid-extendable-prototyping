import type { EntityId, LocationId, ActionId } from '../../domain/value-objects/ids.js';
import type { WorldState, WorldStateReader } from '../../world/WorldState.js';
import type { RandomSource } from '../../world/ports.js';
import type { EmittedEvent } from '../../domain/events.js';

// Action (Subtask 2 §9, Subtask 3 §7.2, bestätigt): canExecute/score erhalten
// nur die Lesesicht WorldStateReader (rein, kein Schreibzugriff); execute
// erhält Schreibzugriff plus den RandomSource-Port.
export interface Action {
  readonly id: ActionId;
  readonly minTicks: number;
  canExecute(entityId: EntityId, world: WorldStateReader): boolean;
  score(entityId: EntityId, world: WorldStateReader): number;
  // Optionaler Hook für den in 02 §9 Schritt 4 beschriebenen Reisemechanismus
  // (Action mit anderem Zielort -> zunächst Traveling). Keine der fünf
  // Baseline-Actions benötigt ihn aktuell (Work/Trade gaten bereits über
  // canExecute auf Anwesenheit, s. Subtask 4-Bericht) — als Erweiterungspunkt
  // beibehalten, nicht neu erfunden.
  requiredLocation?(entityId: EntityId, world: WorldStateReader): LocationId | undefined;
  // events (Subtask 4, mechanische Ergänzung): ActionExecutionSystem kennt die
  // fachliche Wirkung einzelner Actions nicht (02 §5) und kann daher kein
  // TradeEvent o.Ä. selbst formulieren — es leitet nur generisch weiter, was
  // die Action zurückgibt (02 §7: "Events: abhängig von der ausgeführten
  // Action"). Notwendige Ergänzung des execute()-Rückgabetyps, keine neue
  // Architektur.
  execute(entityId: EntityId, world: WorldState, rng: RandomSource): { done: boolean; events?: EmittedEvent[] };
}
