import type { Season, Weather, ResourceType } from '../../domain/value-objects/enums.js';
import { productiveResourceFor } from '../../domain/environment.js';
import type { WorldState } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';

// ProductionSystem (Subtask 2 §5, Perception 3.): passive Ressourcenerzeugung
// produktiver Gebäude, skaliert mit Jahreszeit/Wetter. 'Field' -> Food,
// 'Workplace' -> Wood (domain/environment.ts productiveResourceFor).
// Nutzt den Substream 'production'; Iteration über Gebäude in fester
// (ID-)Reihenfolge (environment.buildings ist in Erzeugungsreihenfolge = nach
// aufsteigender BuildingId sortiert, da so config-authored).
//
// v2, Subtask 9 §6/§11 (V2-I6): zusätzlicher Multiplikator aus
// Building.condition, nie unter config.maintenance.minProductionMultiplier
// (kein permanenter Totalausfall). Liest condition nur lesend — geschrieben
// wird es ausschließlich von MaintenanceSystem (Subtask 9 §6, Single
// Responsibility).

const SEASON_FOOD_MULTIPLIER: Record<Season, number> = { Spring: 1.0, Summer: 1.2, Autumn: 1.1, Winter: 0.6 };
const WEATHER_FOOD_MULTIPLIER: Record<Weather, number> = { Clear: 1.0, Rain: 1.1, Storm: 0.7, Snow: 0.5 };
const SEASON_WOOD_MULTIPLIER: Record<Season, number> = { Spring: 1.0, Summer: 0.9, Autumn: 1.1, Winter: 0.8 };
const WEATHER_WOOD_MULTIPLIER: Record<Weather, number> = { Clear: 1.0, Rain: 0.9, Storm: 0.6, Snow: 0.7 };

function multiplierFor(resource: ResourceType, season: Season, weather: Weather): number {
  return resource === 'Food'
    ? SEASON_FOOD_MULTIPLIER[season] * WEATHER_FOOD_MULTIPLIER[weather]
    : SEASON_WOOD_MULTIPLIER[season] * WEATHER_WOOD_MULTIPLIER[weather];
}

export function runProductionSystem(world: WorldState, ctx: TickContext): void {
  const buildings = [...world.environment.buildings].sort((a, b) => a.id - b.id);

  for (const building of buildings) {
    const resource = productiveResourceFor(building.kind);
    if (!resource) continue;

    const baseRate = ctx.config.economy.productionBaseRate[resource];
    const environmentMultiplier = multiplierFor(resource, world.environment.season, world.environment.weather);
    const conditionMultiplier =
      building.condition !== undefined
        ? Math.max(ctx.config.maintenance.minProductionMultiplier, building.condition / 100)
        : 1;
    const variance = 0.9 + ctx.rng.stream('production').nextFloat() * 0.2; // ±10%
    const amount = Math.max(0, Math.round(baseRate * environmentMultiplier * conditionMultiplier * variance));

    if (amount > 0) {
      building.inventory[resource] += amount;
      ctx.emit({ type: 'HarvestEvent', buildingId: building.id, resource, amount });
    }
  }
}
