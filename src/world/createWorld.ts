import { createEntity } from './EntityRegistry.js';
import { buildEnvironment, type LocationInput, type BuildingInput } from './EnvironmentState.js';
import { createWorldState, type WorldState } from './WorldState.js';
import { IDLE_ACTIVITY } from '../domain/components/ai-state.js';
import type { PersonNeeds, AnimalNeeds } from '../domain/components/needs.js';
import type { Role } from '../domain/value-objects/enums.js';

// createWorld (Subtask 2 §2 "Welterzeugung", Subtask 3 §21 Empfehlung 1):
// baut den statischen Weltgraphen und seedet die initiale Population.
// Bewusst ohne RNG: die Verteilung der Startpopulation über die Orte ist
// eine reine, deterministische Round-Robin-Zuweisung in Konstruktionsreihen-
// folge — keine neue, in 01-03 nicht benannte RNG-Substream nötig.

export interface CreateWorldInput {
  masterSeed: number;
  locations: readonly LocationInput[];
  buildings: readonly BuildingInput[];
  initialPopulation: { humans: number; animals: number; roles?: { farmers: number; lumberjacks: number } };
  eventHistoryCapacity: number;
  // v2, Subtask 9 §18/ADR-V2-06: initiale Personen starten mit diesem Alter.
  // Default 0 entspricht dem v1-Verhalten. Der Aufrufer (application/) setzt
  // dies für v2 bewusst auf config.reproduction.minAdultAgeTicks, um das in
  // Subtask 9 identifizierte garantierte Massensterben der Startpopulation
  // (Altersgate + fehlende Eltern) zu verhindern — Neugeborene bleiben davon
  // unberührt und starten weiterhin bei ticksAlive: 0 (PopulationSystem).
  initialAdultAgeTicks?: number;
}

export function createWorld(input: CreateWorldInput): WorldState {
  const environment = buildEnvironment(input.locations, input.buildings, 'Spring', 'Clear');
  const world = createWorldState({
    masterSeed: input.masterSeed,
    season: environment.season,
    weather: environment.weather,
    locations: environment.locations,
    buildings: environment.buildings,
    eventHistoryCapacity: input.eventHistoryCapacity,
  });

  const locationIds = world.environment.locations.map((l) => l.id);
  if (locationIds.length === 0) {
    return world;
  }

  const initialAge = input.initialAdultAgeTicks ?? 0;
  const roles = input.initialPopulation.roles;
  let farmersRemaining = roles?.farmers ?? 0;
  let lumberjacksRemaining = roles?.lumberjacks ?? 0;

  let cursor = 0;
  for (let i = 0; i < input.initialPopulation.humans; i++) {
    let role: Role | undefined;
    if (farmersRemaining > 0) {
      role = 'Farmer';
      farmersRemaining--;
    } else if (lumberjacksRemaining > 0) {
      role = 'Lumberjack';
      lumberjacksRemaining--;
    }
    spawnPerson(world, locationIds[cursor % locationIds.length]!, initialAge, role);
    cursor++;
  }
  for (let i = 0; i < input.initialPopulation.animals; i++) {
    spawnAnimal(world, locationIds[cursor % locationIds.length]!);
    cursor++;
  }

  return world;
}

function spawnPerson(
  world: WorldState,
  locationId: WorldState['environment']['locations'][number]['id'],
  ticksAlive: number,
  role: Role | undefined,
): void {
  const id = createEntity(world);
  world.components.identity.set(id, { kind: 'person', displayName: `Person-${id}`, ...(role !== undefined ? { role } : {}) });
  world.components.position.set(id, { locationId });
  const needs: PersonNeeds = { hunger: 100, energy: 100, social: 100 };
  world.components.needs.set(id, needs);
  world.components.inventory.set(id, { amounts: { Food: 0, Wood: 0 } });
  world.components.age.set(id, { ticksAlive, ticksAtZeroHunger: 0 });
  world.components.aiState.set(id, { currentActivity: IDLE_ACTIVITY });
  world.components.relationships.set(id, { parentIds: [], childIds: [], friendIds: [] });
}

function spawnAnimal(world: WorldState, locationId: WorldState['environment']['locations'][number]['id']): void {
  const id = createEntity(world);
  world.components.identity.set(id, { kind: 'animal', displayName: `Animal-${id}` });
  world.components.position.set(id, { locationId });
  const needs: AnimalNeeds = { hunger: 100, energy: 100 };
  world.components.needs.set(id, needs);
  world.components.age.set(id, { ticksAlive: 0, ticksAtZeroHunger: 0 });
  world.components.aiState.set(id, { currentActivity: IDLE_ACTIVITY });
  world.components.relationships.set(id, { parentIds: [], childIds: [], friendIds: [] });
}
