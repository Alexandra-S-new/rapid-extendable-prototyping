import type { SimulationConfig } from '../../src/config/schema.js';

// Kleine, schnelle Config für Integrationstests — bewusst abweichend von der
// Default-Config (kleinere Welt, weniger Ticks nötig für aussagekräftige
// Assertions).
export function makeTestConfig(overrides?: Partial<SimulationConfig>): SimulationConfig {
  return {
    seed: 12345,
    initialPopulation: { humans: 4, animals: 2 },
    ticksPerDay: 4,
    daysPerSeason: 2,
    needs: {
      hungerDecayPerTick: 1,
      energyDecayPerTick: 1,
      socialDecayPerTick: 1,
      starvationDeathThresholdTicks: 20,
    },
    reproduction: {
      minAdultAgeTicks: 10,
      birthProbabilityPerEligiblePair: 0.5,
      crisisThreshold: 30,
    },
    lifespan: {
      baseMaxLifespanTicks: 100_000,
      lifespanJitterTicks: 0,
    },
    economy: {
      marketExchangeRatio: 1,
      productionBaseRate: { Food: 20, Wood: 20 },
      market: 'FixedRatio',
      supplyDemand: { elasticity: 0.5, minRatio: 0.5, maxRatio: 4 },
    },
    actions: {
      eatRestorePerTick: 20,
      grazeRestorePerTick: 15,
      sleepRestorePerTick: 20,
      socializeRestorePerTick: 20,
      workTransferPerTick: 5,
      tradeAmountPerTrade: 5,
      careTransferPerTick: 10,
    },
    maintenance: {
      conditionDecayPerTick: 0.2,
      woodPerConditionPoint: 1,
      minProductionMultiplier: 0.2,
    },
    worldGraph: {
      locations: [
        { id: 1, name: 'Village', connections: [{ to: 2, travelTicks: 1 }] },
        { id: 2, name: 'Field', connections: [{ to: 1, travelTicks: 1 }] },
      ],
      buildings: [
        { id: 1, kind: 'Field', locationId: 2 },
        { id: 2, kind: 'Market', locationId: 1 },
      ],
    },
    observability: {
      eventHistoryCapacity: 50,
      logLevel: 'error',
    },
    ...overrides,
  };
}
