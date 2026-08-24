import { ConfigurationError } from '../domain/errors.js';
import { parseConfig } from '../config/validate.js';
import { defaultConfig } from '../config/defaults.js';
import type { SimulationConfig } from '../config/schema.js';
import type { RawStorage } from '../world/ports.js';

// loadConfig (Subtask 2 §17): lädt+validiert eine Config-Datei, oder liefert
// die vollständige Default-Config, wenn kein Pfad angegeben ist. Kein
// Deep-Merge einer partiellen Nutzer-Config mit Defaults (02 §17).
export function loadConfig(path: string | undefined, storage: RawStorage): SimulationConfig {
  if (!path) return defaultConfig;

  let content: string;
  try {
    content = storage.read(path);
  } catch (error) {
    throw new ConfigurationError(`Failed to read config file at ${path}: ${(error as Error).message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw new ConfigurationError(`Config file at ${path} is not valid JSON: ${(error as Error).message}`);
  }

  return parseConfig(raw);
}

export function applyCliOverrides(
  config: SimulationConfig,
  overrides: { seed?: number; humans?: number; animals?: number },
): SimulationConfig {
  return {
    ...config,
    seed: overrides.seed ?? config.seed,
    initialPopulation: {
      humans: overrides.humans ?? config.initialPopulation.humans,
      animals: overrides.animals ?? config.initialPopulation.animals,
    },
  };
}
