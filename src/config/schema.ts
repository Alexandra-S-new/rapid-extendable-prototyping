import { z } from 'zod';

// SimulationConfig-Schema (Subtask 2 §17, Subtask 3.8): zod-Validierung.
// Liefert reine, plain-number IDs — Branding erfolgt beim Übergang in die
// Domäne (world/EnvironmentState.ts), nicht hier.

const buildingKindSchema = z.enum(['House', 'Field', 'Market', 'Workplace']);
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

// Vollständiges Record<ResourceType, number> statt z.record(...) — letzteres
// leitet in zod einen Partial-Typ ab (Food/Wood optional), was mit dem
// Domain-Typ Record<ResourceType, number> (beide Felder verpflichtend) nicht
// übereinstimmt.
const resourceAmountsSchema = z.object({
  Food: z.number().nonnegative(),
  Wood: z.number().nonnegative(),
});

const connectionSchema = z.object({
  to: z.number().int().nonnegative(),
  travelTicks: z.number().int().positive(),
});

const locationDefinitionSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  connections: z.array(connectionSchema),
  capacity: z.number().int().positive().optional(),
});

const buildingDefinitionSchema = z.object({
  id: z.number().int().nonnegative(),
  kind: buildingKindSchema,
  locationId: z.number().int().nonnegative(),
});

export const simulationConfigSchema = z.object({
  seed: z.number().int(),
  initialPopulation: z.object({
    humans: z.number().int().nonnegative(),
    animals: z.number().int().nonnegative(),
    // v2, Subtask 9 §7/ADR-V2-04: explizite Stückzahlen für die initiale
    // Rollenzuweisung (nur Welterzeugung, kein Rollenwechsel). Optional —
    // fehlt das Feld, bleiben alle Personen Generalisten (v1-Verhalten).
    roles: z
      .object({
        farmers: z.number().int().nonnegative(),
        lumberjacks: z.number().int().nonnegative(),
      })
      .optional(),
  }),
  ticksPerDay: z.number().int().positive(),
  daysPerSeason: z.number().int().positive(),
  needs: z.object({
    hungerDecayPerTick: z.number().nonnegative(),
    energyDecayPerTick: z.number().nonnegative(),
    socialDecayPerTick: z.number().nonnegative(),
    starvationDeathThresholdTicks: z.number().int().positive(),
  }),
  reproduction: z.object({
    minAdultAgeTicks: z.number().int().nonnegative(),
    birthProbabilityPerEligiblePair: z.number().min(0).max(1),
    // Subtask 4, mechanische Ergänzung: 03 §10 verlangt eine "konfigurierte
    // Krisenschwelle" für Fortpflanzungs-Eligibilität, ohne den Feldnamen zu
    // benennen (gleiche Begründung wie bei config.actions oben).
    crisisThreshold: z.number().min(0).max(100),
  }),
  lifespan: z.object({
    baseMaxLifespanTicks: z.number().int().positive(),
    lifespanJitterTicks: z.number().int().nonnegative(),
  }),
  economy: z.object({
    marketExchangeRatio: z.number().positive(),
    productionBaseRate: resourceAmountsSchema,
    // v2, Subtask 9 §8.4/ADR-V2-05: Auswahl der Market-Strategie. Default
    // bleibt 'FixedRatio' (v1-Verhalten unverändert).
    market: z.enum(['FixedRatio', 'SupplyDemand']),
    supplyDemand: z.object({
      elasticity: z.number().nonnegative(),
      minRatio: z.number().positive(),
      maxRatio: z.number().positive(),
    }),
  }),
  // Subtask 4, mechanische Ergänzung: 02 §17 verlangt "keine Magic Numbers in
  // simulation/" und 03 §16 spricht von einer "konfigurierten Menge" für die
  // Work-Action, ohne die Feldnamen zu benennen. Keine neue Architektur —
  // nur die durch diese Regeln bereits vorausgesetzten Config-Blätter.
  actions: z.object({
    eatRestorePerTick: z.number().nonnegative(),
    grazeRestorePerTick: z.number().nonnegative(),
    sleepRestorePerTick: z.number().nonnegative(),
    socializeRestorePerTick: z.number().nonnegative(),
    workTransferPerTick: z.number().nonnegative(),
    tradeAmountPerTrade: z.number().nonnegative(),
    // v2, Subtask 9 §4/ADR-V2-01: Food-Menge je Care-Ausführung.
    careTransferPerTick: z.number().nonnegative(),
  }),
  // v2, Subtask 9 §6/ADR-V2-03: Gebäudeverschleiß/-instandhaltung (Wood-Sink).
  maintenance: z.object({
    conditionDecayPerTick: z.number().nonnegative(),
    woodPerConditionPoint: z.number().positive(),
    minProductionMultiplier: z.number().min(0).max(1),
  }),
  worldGraph: z.object({
    locations: z.array(locationDefinitionSchema),
    buildings: z.array(buildingDefinitionSchema),
  }),
  observability: z.object({
    eventHistoryCapacity: z.number().int().positive(),
    logLevel: logLevelSchema,
  }),
});

export type SimulationConfig = z.infer<typeof simulationConfigSchema>;
export type LocationDefinition = z.infer<typeof locationDefinitionSchema>;
export type BuildingDefinition = z.infer<typeof buildingDefinitionSchema>;
