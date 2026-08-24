import type { SimulationConfig } from './schema.js';

// defaults.ts (Subtask 2 §17): vollständige Default-Config. Kein Deep-Merge
// mit Nutzer-Config (02 §17) — eine angegebene Config muss vollständig sein.
export const defaultConfig: SimulationConfig = {
  seed: 1,
  initialPopulation: { humans: 20, animals: 10 },
  ticksPerDay: 24,
  daysPerSeason: 30,
  needs: {
    hungerDecayPerTick: 1,
    energyDecayPerTick: 1,
    socialDecayPerTick: 0.5,
    starvationDeathThresholdTicks: 72,
  },
  reproduction: {
    minAdultAgeTicks: 400,
    birthProbabilityPerEligiblePair: 0.01,
    crisisThreshold: 30,
  },
  lifespan: {
    baseMaxLifespanTicks: 20000,
    lifespanJitterTicks: 2000,
  },
  economy: {
    marketExchangeRatio: 1.5,
    // Subtask 4, Tuning: bei 20 Personen und nur einem Field/Workplace
    // überstieg die Nachfrage (bis zu 20 * workTransferPerTick pro Tick) die
    // ursprüngliche Rate (5/3) um ein Vielfaches — die niedrigste EntityId
    // monopolisierte den gesamten Ertrag (03 §12, dokumentiertes, "nicht
    // faires" Verhalten), der Rest verhungerte. Höhere Basisrate macht den
    // Default-Lauf überlebensfähig, ohne den Konfliktauflösungsmechanismus
    // selbst zu ändern.
    productionBaseRate: { Food: 30, Wood: 18 },
    // v2, Subtask 9 §8.4/ADR-V2-05: Default bleibt FixedRatio — v1-Verhalten
    // unverändert, solange SupplyDemand nicht explizit gewählt wird.
    market: 'FixedRatio',
    supplyDemand: {
      elasticity: 0.5,
      minRatio: 0.5,
      maxRatio: 4,
    },
  },
  actions: {
    eatRestorePerTick: 20,
    grazeRestorePerTick: 15,
    sleepRestorePerTick: 20,
    socializeRestorePerTick: 20,
    workTransferPerTick: 5,
    tradeAmountPerTrade: 5,
    // v2, Subtask 9 §4/ADR-V2-01.
    careTransferPerTick: 10,
  },
  // v2, Subtask 9 §6/ADR-V2-03: bewusst konservativ (langsamer Verschleiß),
  // um das in Subtask 5 beobachtete Doppel-Knappheitsrisiko nicht zu
  // verschärfen (Annahme, s. 05-v2-architektur-domänenmodell.md Abschnitt 18).
  maintenance: {
    conditionDecayPerTick: 0.2,
    woodPerConditionPoint: 1,
    minProductionMultiplier: 0.2,
  },
  worldGraph: {
    locations: [
      { id: 1, name: 'Village', connections: [{ to: 2, travelTicks: 2 }, { to: 3, travelTicks: 2 }, { to: 4, travelTicks: 1 }] },
      { id: 2, name: 'Field', connections: [{ to: 1, travelTicks: 2 }] },
      { id: 3, name: 'Forest', connections: [{ to: 1, travelTicks: 2 }] },
      { id: 4, name: 'Market', connections: [{ to: 1, travelTicks: 1 }] },
    ],
    buildings: [
      { id: 1, kind: 'House', locationId: 1 },
      { id: 2, kind: 'Field', locationId: 2 },
      { id: 3, kind: 'Workplace', locationId: 3 },
      { id: 4, kind: 'Market', locationId: 4 },
    ],
  },
  observability: {
    eventHistoryCapacity: 5000,
    logLevel: 'info',
  },
};
