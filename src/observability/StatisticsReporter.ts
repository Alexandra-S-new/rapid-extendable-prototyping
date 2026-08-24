import type { WorldStateReader } from '../world/WorldState.js';
import type { ResourceType } from '../domain/value-objects/enums.js';
import { hasSocialNeed } from '../domain/components/needs.js';

// StatisticsReporter (Subtask 2 §14): rein lesender, on-demand berechneter
// Statistik-Baustein — beeinflusst den Weltzustand nicht.
export interface Statistics {
  population: { person: number; animal: number };
  averageNeeds: { hunger: number; energy: number; social: number };
  resourceTotals: Record<ResourceType, number>;
  birthsLastNTicks: number;
  deathsLastNTicks: number;
  tradeVolumeLastNTicks: number;
}

export function computeStatistics(world: WorldStateReader, lastNTicks: number): Statistics {
  let personCount = 0;
  let animalCount = 0;
  let hungerSum = 0;
  let energySum = 0;
  let socialSum = 0;
  let socialCount = 0;
  let needsCount = 0;

  for (const [entityId, identity] of world.components.identity) {
    if (identity.kind === 'person') personCount++;
    else animalCount++;

    const needs = world.components.needs.get(entityId);
    if (!needs) continue;
    needsCount++;
    hungerSum += needs.hunger;
    energySum += needs.energy;
    if (hasSocialNeed(needs)) {
      socialSum += needs.social;
      socialCount++;
    }
  }

  const resourceTotals: Record<ResourceType, number> = { Food: 0, Wood: 0 };
  for (const inventory of world.components.inventory.values()) {
    resourceTotals.Food += inventory.amounts.Food;
    resourceTotals.Wood += inventory.amounts.Wood;
  }
  for (const building of world.environment.buildings) {
    resourceTotals.Food += building.inventory.Food;
    resourceTotals.Wood += building.inventory.Wood;
  }

  const cutoffTick = world.clock.currentTick - lastNTicks;
  let births = 0;
  let deaths = 0;
  let tradeVolume = 0;
  for (const event of world.events.history.toArray()) {
    if (event.tick < cutoffTick) continue;
    if (event.type === 'BirthEvent') births++;
    else if (event.type === 'DeathEvent') deaths++;
    else if (event.type === 'TradeEvent') tradeVolume += event.amount;
  }

  return {
    population: { person: personCount, animal: animalCount },
    averageNeeds: {
      hunger: needsCount > 0 ? hungerSum / needsCount : 0,
      energy: needsCount > 0 ? energySum / needsCount : 0,
      social: socialCount > 0 ? socialSum / socialCount : 0,
    },
    resourceTotals,
    birthsLastNTicks: births,
    deathsLastNTicks: deaths,
    tradeVolumeLastNTicks: tradeVolume,
  };
}
