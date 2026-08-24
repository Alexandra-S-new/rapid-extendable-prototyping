import { PersistenceError, ValidationError } from '../domain/errors.js';
import type { WorldState } from '../world/WorldState.js';
import type { RawStorage } from '../world/ports.js';
import type { SimulationConfig } from '../config/schema.js';
import { saveFileSchema, CURRENT_SCHEMA_VERSION } from './schema.js';
import { deserialize } from './deserialize.js';

export interface LoadResult {
  world: WorldState;
  config: SimulationConfig;
}

// load (Subtask 2 §13, Subtask 2 §20 Persistenzfluss): RawStorage.read ->
// JSON.parse -> zod-Validierung -> schemaVersion-Prüfung ->
// Referenzintegrität -> neuer WorldState (construct-then-swap durch den
// Aufrufer, nie in-place). Gibt zusätzlich die im SaveFile eingebettete
// SimulationConfig zurück, da der Aufrufer (application/) sie für die
// Fortsetzung der Simulation ohnehin braucht.
export function load(path: string, storage: RawStorage): LoadResult {
  let content: string;
  try {
    content = storage.read(path);
  } catch (error) {
    throw new PersistenceError(`Failed to read save file at ${path}: ${(error as Error).message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw new PersistenceError(`Save file at ${path} is not valid JSON: ${(error as Error).message}`);
  }

  const result = saveFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ValidationError('savegame', issues);
  }

  const file = result.data;
  if (file.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new PersistenceError(
      `Save file schemaVersion mismatch: expected ${CURRENT_SCHEMA_VERSION}, got ${file.schemaVersion}`,
    );
  }

  return { world: deserialize(file), config: file.config };
}
