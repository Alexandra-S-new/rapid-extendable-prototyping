import type { EntityId } from '../domain/value-objects/ids.js';
import type { Season, Weather } from '../domain/value-objects/enums.js';
import type { Location, Building } from '../domain/environment.js';
import type { SimEvent } from '../domain/events.js';
import { asEntityId } from '../domain/value-objects/ids.js';
import {
  createComponentStores,
  type ComponentStores,
  type ComponentStoresReader,
} from './ComponentStores.js';
import { RingBuffer, type ReadonlyRingBuffer } from './RingBuffer.js';

// WorldState (Subtask 2 §4): Single Source of Truth. Enthält keine Fachlogik
// (Subtask 3 §3.2) — reiner Aggregatzustand, verändert ausschließlich durch
// Systeme entlang der dokumentierten Mutationsregeln.
export interface WorldState {
  clock: { currentTick: number };
  rng: { masterSeed: number; streamStates: Record<string, number> };
  entities: {
    nextEntityId: EntityId;
    alive: EntityId[]; // sortiert gehalten
    pendingRemovals: EntityId[];
  };
  components: ComponentStores;
  environment: {
    season: Season;
    weather: Weather;
    locations: Location[];
    buildings: Building[];
  };
  events: {
    pending: SimEvent[];
    history: RingBuffer<SimEvent>;
    nextSequence: number;
  };
}

// WorldStateReader (Subtask 3 §7.1): schmale Lesesicht, erzwingt strukturell
// "nur lesend" — für Action.canExecute/score und observability/.
export interface WorldStateReader {
  readonly clock: Readonly<{ currentTick: number }>;
  readonly rng: Readonly<{ masterSeed: number; streamStates: Readonly<Record<string, number>> }>;
  readonly entities: Readonly<{
    nextEntityId: EntityId;
    alive: readonly EntityId[];
    pendingRemovals: readonly EntityId[];
  }>;
  readonly components: ComponentStoresReader;
  readonly environment: Readonly<{
    season: Season;
    weather: Weather;
    locations: readonly Location[];
    buildings: readonly Building[];
  }>;
  readonly events: Readonly<{
    pending: readonly SimEvent[];
    history: ReadonlyRingBuffer<SimEvent>;
    nextSequence: number;
  }>;
}

export function toWorldStateReader(world: WorldState): WorldStateReader {
  return {
    clock: world.clock,
    rng: world.rng,
    entities: world.entities,
    components: world.components,
    environment: world.environment,
    events: world.events,
  };
}

export interface CreateWorldStateOptions {
  masterSeed: number;
  season: Season;
  weather: Weather;
  locations: Location[];
  buildings: Building[];
  eventHistoryCapacity: number;
}

export function createWorldState(options: CreateWorldStateOptions): WorldState {
  return {
    clock: { currentTick: 0 },
    rng: { masterSeed: options.masterSeed, streamStates: {} },
    entities: {
      nextEntityId: asEntityId(1), // 0 ist "kein Entity" (Subtask 2 §3)
      alive: [],
      pendingRemovals: [],
    },
    components: createComponentStores(),
    environment: {
      season: options.season,
      weather: options.weather,
      locations: options.locations,
      buildings: options.buildings,
    },
    events: {
      pending: [],
      history: new RingBuffer<SimEvent>(options.eventHistoryCapacity),
      nextSequence: 0,
    },
  };
}
