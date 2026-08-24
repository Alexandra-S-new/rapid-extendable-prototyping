import { z } from 'zod';
import { simulationConfigSchema } from '../config/schema.js';

// SaveFile-Schema (Subtask 2 §13, Subtask 3.9): spiegelt exakt die
// dokumentierte Struktur. Component-Stores werden als [EntityId, Component][]
// serialisiert (Map ist nicht JSON-fähig). pendingRemovals/events.pending
// sind bewusst NICHT Teil des SaveFile (transient, nur innerhalb eines Ticks
// relevant — 02 §13 listet sie nicht).

const entityIdSchema = z.number().int().nonnegative();
const locationIdSchema = z.number().int().nonnegative();
const buildingIdSchema = z.number().int().nonnegative();
const resourceTypeSchema = z.enum(['Food', 'Wood']);
const seasonSchema = z.enum(['Spring', 'Summer', 'Autumn', 'Winter']);
const weatherSchema = z.enum(['Clear', 'Rain', 'Storm', 'Snow']);
// Vollständiges Record<ResourceType, number> statt z.record(...) — s.
// config/schema.ts für die Begründung (Partial- vs. Total-Typ).
const resourceAmountsSchema = z.object({ Food: z.number(), Wood: z.number() });

const identitySchema = z.object({
  kind: z.enum(['person', 'animal']),
  species: z.string().optional(),
  displayName: z.string(),
  // v2, Subtask 9 §7/ADR-V2-04.
  role: z.enum(['Farmer', 'Lumberjack']).optional(),
});

const positionSchema = z.object({
  locationId: locationIdSchema,
});

const needsSchema = z.union([
  z.object({ hunger: z.number(), energy: z.number(), social: z.number() }),
  z.object({ hunger: z.number(), energy: z.number() }).strict(),
]);

const inventorySchema = z.object({
  amounts: resourceAmountsSchema,
});

const ageSchema = z.object({
  ticksAlive: z.number().int().nonnegative(),
  ticksAtZeroHunger: z.number().int().nonnegative(),
});

const activitySchema = z.union([
  z.object({ kind: z.literal('Idle') }),
  z.object({
    kind: z.literal('Traveling'),
    destination: locationIdSchema,
    path: z.array(locationIdSchema),
    nextHopIndex: z.number().int().nonnegative(),
    ticksRemainingInHop: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('Performing'),
    actionId: z.string(),
    ticksInAction: z.number().int().nonnegative(),
  }),
]);

const aiStateSchema = z.object({ currentActivity: activitySchema });

const relationshipsSchema = z.object({
  parentIds: z.array(entityIdSchema),
  childIds: z.array(entityIdSchema),
  // v2, Subtask 9 §5/ADR-V2-02 (V2-I1).
  partnerId: entityIdSchema.optional(),
  // A1, Subtask 15-17/ADR-A1-01 (V2-A1-I1): Pflichtfeld, nicht optional wie
  // partnerId — friendIds ist strukturell immer ein (ggf. leeres) Array.
  friendIds: z.array(entityIdSchema),
});

const connectionSchema = z.object({ to: locationIdSchema, travelTicks: z.number().int().positive() });

const locationSchema = z.object({
  id: locationIdSchema,
  name: z.string(),
  connections: z.array(connectionSchema),
  capacity: z.number().int().positive().optional(),
  buildingIds: z.array(buildingIdSchema),
});

const buildingSchema = z.object({
  id: buildingIdSchema,
  kind: z.enum(['House', 'Field', 'Market', 'Workplace']),
  inventory: resourceAmountsSchema,
  locationId: locationIdSchema,
  // v2, Subtask 9 §6/ADR-V2-03 (V2-I4/I5).
  condition: z.number().min(0).max(100).optional(),
});

const simEventSchema = z.union([
  z.object({ type: z.literal('BirthEvent'), sequence: z.number(), tick: z.number(), entityId: entityIdSchema, parentIds: z.array(entityIdSchema) }),
  z.object({ type: z.literal('DeathEvent'), sequence: z.number(), tick: z.number(), entityId: entityIdSchema, cause: z.enum(['starvation', 'old_age']) }),
  z.object({
    type: z.literal('TradeEvent'),
    sequence: z.number(),
    tick: z.number(),
    buyer: entityIdSchema,
    seller: entityIdSchema,
    resource: resourceTypeSchema,
    amount: z.number(),
    price: z.number(),
  }),
  z.object({
    type: z.literal('HarvestEvent'),
    sequence: z.number(),
    tick: z.number(),
    buildingId: buildingIdSchema,
    resource: resourceTypeSchema,
    amount: z.number(),
  }),
  z.object({
    type: z.literal('MovementEvent'),
    sequence: z.number(),
    tick: z.number(),
    entityId: entityIdSchema,
    fromLocation: locationIdSchema,
    toLocation: locationIdSchema,
  }),
  z.object({ type: z.literal('SeasonChangedEvent'), sequence: z.number(), tick: z.number(), season: seasonSchema }),
  z.object({ type: z.literal('WeatherChangedEvent'), sequence: z.number(), tick: z.number(), weather: weatherSchema }),
  // v2, Subtask 9 §13/ADR-V2-08.
  z.object({
    type: z.literal('BuildingConditionChangedEvent'),
    sequence: z.number(),
    tick: z.number(),
    buildingId: buildingIdSchema,
    condition: z.number(),
    band: z.enum(['healthy', 'degraded', 'critical']),
  }),
]);

function componentEntriesSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.array(z.tuple([entityIdSchema, valueSchema]));
}

export const saveFileSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  savedAtTick: z.number().int().nonnegative(),
  meta: z.object({ createdAt: z.string(), engineVersion: z.string() }),
  config: simulationConfigSchema,
  world: z.object({
    clock: z.object({ currentTick: z.number().int().nonnegative() }),
    rng: z.object({ masterSeed: z.number().int(), streamStates: z.record(z.string(), z.number()) }),
    entities: z.object({ nextEntityId: entityIdSchema, alive: z.array(entityIdSchema) }),
    components: z.object({
      identity: componentEntriesSchema(identitySchema),
      position: componentEntriesSchema(positionSchema),
      needs: componentEntriesSchema(needsSchema),
      inventory: componentEntriesSchema(inventorySchema),
      age: componentEntriesSchema(ageSchema),
      aiState: componentEntriesSchema(aiStateSchema),
      relationships: componentEntriesSchema(relationshipsSchema),
    }),
    environment: z.object({
      season: seasonSchema,
      weather: weatherSchema,
      locations: z.array(locationSchema),
      buildings: z.array(buildingSchema),
    }),
    events: z.object({
      history: z.array(simEventSchema),
      nextSequence: z.number().int().nonnegative(),
    }),
  }),
});

export type SaveFile = z.infer<typeof saveFileSchema>;

// v2, Subtask 9 §15/ADR-V2-09: Bump auf 2 (neue Felder: partnerId, role,
// condition, BuildingConditionChangedEvent).
// A1, Subtask 15-17/ADR-A1-05: Bump auf 3 (neues Feld: friendIds). Weiterhin
// kein Migrationspfad (ADR-10 unverändert) — Spielstände aus Schema 1 oder 2
// werden korrekt mit PersistenceError abgelehnt.
export const CURRENT_SCHEMA_VERSION = 3;
