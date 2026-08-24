import { createWorldState, type WorldState } from '../../src/world/WorldState.js';
import { createEntity } from '../../src/world/EntityRegistry.js';
import { RngOrchestrator } from '../../src/world/rng/RngOrchestrator.js';
import { PathTable } from '../../src/world/PathTable.js';
import { Mulberry32RandomSource } from '../../src/random/Mulberry32RandomSource.js';
import { IDLE_ACTIVITY } from '../../src/domain/components/ai-state.js';
import { asLocationId, asBuildingId, type EntityId, type LocationId } from '../../src/domain/value-objects/ids.js';
import type { PersonNeeds, AnimalNeeds } from '../../src/domain/components/needs.js';
import type { Location, Building } from '../../src/domain/environment.js';
import type { TickContext } from '../../src/simulation/TickContext.js';
import { defaultConfig } from '../../src/config/defaults.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import type { SimulationConfig } from '../../src/config/schema.js';
import type { EmittedEvent } from '../../src/domain/events.js';

// buildTestWorld-Fixture-Helfer (02 §19): reduziert Wiederholung beim Aufbau
// von Test-Welten. Testinterne Abstraktion, fließt nicht in Produktionscode.

export function buildTestWorld(options?: {
  locations?: Location[];
  buildings?: Building[];
  eventHistoryCapacity?: number;
  masterSeed?: number;
}): WorldState {
  const locations: Location[] = options?.locations ?? [
    { id: asLocationId(1), name: 'A', connections: [{ to: asLocationId(2), travelTicks: 2 }], buildingIds: [] },
    { id: asLocationId(2), name: 'B', connections: [{ to: asLocationId(1), travelTicks: 2 }], buildingIds: [] },
  ];
  const buildings: Building[] = options?.buildings ?? [];
  return createWorldState({
    masterSeed: options?.masterSeed ?? 1,
    season: 'Spring',
    weather: 'Clear',
    locations,
    buildings,
    eventHistoryCapacity: options?.eventHistoryCapacity ?? 100,
  });
}

export function addPerson(
  world: WorldState,
  overrides?: { locationId?: LocationId; needs?: Partial<PersonNeeds>; ticksAlive?: number },
): EntityId {
  const id = createEntity(world);
  world.components.identity.set(id, { kind: 'person', displayName: `Person-${id}` });
  world.components.position.set(id, { locationId: overrides?.locationId ?? asLocationId(1) });
  const needs: PersonNeeds = { hunger: 100, energy: 100, social: 100, ...overrides?.needs };
  world.components.needs.set(id, needs);
  world.components.inventory.set(id, { amounts: { Food: 0, Wood: 0 } });
  world.components.age.set(id, { ticksAlive: overrides?.ticksAlive ?? 0, ticksAtZeroHunger: 0 });
  world.components.aiState.set(id, { currentActivity: IDLE_ACTIVITY });
  world.components.relationships.set(id, { parentIds: [], childIds: [], friendIds: [] });
  return id;
}

export function addAnimal(
  world: WorldState,
  overrides?: { locationId?: LocationId; needs?: Partial<AnimalNeeds>; ticksAlive?: number },
): EntityId {
  const id = createEntity(world);
  world.components.identity.set(id, { kind: 'animal', displayName: `Animal-${id}` });
  world.components.position.set(id, { locationId: overrides?.locationId ?? asLocationId(1) });
  const needs: AnimalNeeds = { hunger: 100, energy: 100, ...overrides?.needs };
  world.components.needs.set(id, needs);
  world.components.age.set(id, { ticksAlive: overrides?.ticksAlive ?? 0, ticksAtZeroHunger: 0 });
  world.components.aiState.set(id, { currentActivity: IDLE_ACTIVITY });
  world.components.relationships.set(id, { parentIds: [], childIds: [], friendIds: [] });
  return id;
}

export function buildTestContext(world: WorldState, configOverrides?: Partial<SimulationConfig>): TickContext {
  const config: SimulationConfig = { ...defaultConfig, ...configOverrides };
  const rng = new RngOrchestrator(world.rng, (state) => new Mulberry32RandomSource(state));
  const pathTable = PathTable.build(world.environment.locations);
  const logger = new ConsoleLogger('error');
  return {
    config,
    logger,
    rng,
    pathTable,
    emit: (event: EmittedEvent) => {
      const sequence = world.events.nextSequence;
      world.events.nextSequence += 1;
      world.events.pending.push({ ...event, sequence, tick: world.clock.currentTick } as never);
    },
  };
}

export function makeTestBuilding(id: number, kind: Building['kind'], locationId: number, foodOrWood = 0): Building {
  return {
    id: asBuildingId(id),
    kind,
    locationId: asLocationId(locationId),
    inventory: { Food: kind === 'Field' ? foodOrWood : 0, Wood: kind === 'Workplace' ? foodOrWood : 0 },
  };
}
