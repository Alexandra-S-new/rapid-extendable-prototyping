import type { WorldState } from '../world/WorldState.js';
import type { SimulationConfig } from '../config/schema.js';
import { CURRENT_SCHEMA_VERSION, type SaveFile } from './schema.js';

// serialize (Subtask 3 §7.5): rein, deterministisch, ohne I/O.
export function serialize(world: WorldState, config: SimulationConfig, engineVersion: string, createdAt: string): SaveFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAtTick: world.clock.currentTick,
    meta: { createdAt, engineVersion },
    config,
    world: {
      clock: { currentTick: world.clock.currentTick },
      rng: { masterSeed: world.rng.masterSeed, streamStates: { ...world.rng.streamStates } },
      entities: { nextEntityId: world.entities.nextEntityId, alive: [...world.entities.alive] },
      components: {
        identity: [...world.components.identity.entries()],
        position: [...world.components.position.entries()],
        needs: [...world.components.needs.entries()],
        inventory: [...world.components.inventory.entries()],
        age: [...world.components.age.entries()],
        aiState: [...world.components.aiState.entries()],
        relationships: [...world.components.relationships.entries()],
      },
      environment: {
        season: world.environment.season,
        weather: world.environment.weather,
        locations: world.environment.locations,
        buildings: world.environment.buildings,
      },
      events: {
        history: world.events.history.toArray(),
        nextSequence: world.events.nextSequence,
      },
    },
  } as SaveFile;
}
