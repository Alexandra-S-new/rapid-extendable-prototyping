import type { BuildingConditionBand } from '../../domain/value-objects/enums.js';
import type { WorldState } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';

// MaintenanceSystem (v2, Subtask 9 §6/ADR-V2-03): Gebäudeverschleiß und
// self-funded Instandhaltung — der beschlossene Wood-Sink (Subtask 9 §8.1).
// Eigenständiges System (Single Responsibility, kein Umbau von
// ProductionSystem), Perception-Phase, nach WeatherSystem, vor
// ProductionSystem (damit der für diesen Tick aktuelle Zustand die
// Produktion desselben Ticks beeinflusst).
//
// Nur Gebäude mit condition !== undefined (Field/Workplace, V2-I5) sind
// betroffen. Kein RNG (reine Arithmetik, analog Needs-Zerfall).
//
// Bandschwellen (Subtask 4-Implementierungsdetail-Präzedenzfall, vgl.
// WeatherSystem-Gewichtungen): keine der Baseline-Dokumente legt konkrete
// Zahlen fest; rein für die Observability-Kategorisierung von
// BuildingConditionChangedEvent, ohne mechanische Simulationswirkung.
const HEALTHY_THRESHOLD = 70;
const DEGRADED_THRESHOLD = 30;

function bandFor(condition: number): BuildingConditionBand {
  if (condition >= HEALTHY_THRESHOLD) return 'healthy';
  if (condition >= DEGRADED_THRESHOLD) return 'degraded';
  return 'critical';
}

export function runMaintenanceSystem(world: WorldState, ctx: TickContext): void {
  for (const building of world.environment.buildings) {
    if (building.condition === undefined) continue;

    const bandBefore = bandFor(building.condition);

    // Verschleiß (geklemmt, V2-I4).
    building.condition = Math.max(0, building.condition - ctx.config.maintenance.conditionDecayPerTick);

    // Self-funded Reparatur aus dem eigenen Wood-Bestand des Gebäudes.
    const deficit = 100 - building.condition;
    if (deficit > 0 && building.inventory.Wood > 0) {
      const woodNeeded = deficit * ctx.config.maintenance.woodPerConditionPoint;
      const woodUsed = Math.min(building.inventory.Wood, woodNeeded);
      const pointsRestored = woodUsed / ctx.config.maintenance.woodPerConditionPoint;
      building.inventory.Wood -= woodUsed;
      building.condition = Math.min(100, building.condition + pointsRestored);
    }

    const bandAfter = bandFor(building.condition);
    if (bandAfter !== bandBefore) {
      ctx.emit({ type: 'BuildingConditionChangedEvent', buildingId: building.id, condition: building.condition, band: bandAfter });
    }
  }
}
