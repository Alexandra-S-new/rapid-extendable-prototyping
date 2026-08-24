import type { Logger } from '../world/ports.js';
import type { RngOrchestrator } from '../world/rng/RngOrchestrator.js';
import type { PathTable } from '../world/PathTable.js';
import type { SimulationConfig } from '../config/schema.js';
import type { EmittedEvent } from '../domain/events.js';

// TickContext (Subtask 2 §5): { config, logger, emit(event) } plus rng
// (RngOrchestrator) — jedem System zusätzlich zu WorldState übergeben.
// Type-only Import aus config/: erzeugt keinen Zyklus (config/ hängt seinerseits
// nicht von simulation/ ab) und vermeidet Duplikation der SimulationConfig-Form
// (02 §17: Config-Werte werden per Parameterübergabe injiziert, nie hartkodiert).
// pathTable: einmalig bei Welterzeugung berechnete All-Pairs-Pfadtabelle
// (02 §10) — rein abgeleitet aus dem statischen Location-Graphen, kein Teil
// von WorldState, per DI an DecisionSystem/MovementSystem gereicht.
export interface TickContext {
  readonly config: SimulationConfig;
  readonly logger: Logger;
  readonly rng: RngOrchestrator;
  readonly pathTable: PathTable;
  emit(event: EmittedEvent): void;
}
