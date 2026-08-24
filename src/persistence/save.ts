import { PersistenceError } from '../domain/errors.js';
import type { WorldState } from '../world/WorldState.js';
import type { RawStorage } from '../world/ports.js';
import type { SimulationConfig } from '../config/schema.js';
import { serialize } from './serialize.js';

// save (Subtask 2 §13, Subtask 2 §20 Persistenzfluss): serialisieren ->
// JSON.stringify -> RawStorage.write. I/O-Fehler -> PersistenceError.
export function save(
  path: string,
  world: WorldState,
  config: SimulationConfig,
  storage: RawStorage,
  engineVersion: string,
  createdAt: string,
): void {
  const file = serialize(world, config, engineVersion, createdAt);
  const content = JSON.stringify(file, null, 2);
  try {
    storage.write(path, content);
  } catch (error) {
    throw new PersistenceError(`Failed to write save file at ${path}: ${(error as Error).message}`);
  }
}
