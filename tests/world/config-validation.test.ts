import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../src/config/validate.js';
import { defaultConfig } from '../../src/config/defaults.js';
import { ValidationError } from '../../src/domain/errors.js';

function clone(): typeof defaultConfig {
  return JSON.parse(JSON.stringify(defaultConfig));
}

describe('Config-Validierung (Subtask 2 §17, Subtask 3.5, Subtask 3.8)', () => {
  it('akzeptiert die Default-Config', () => {
    expect(() => parseConfig(clone())).not.toThrow();
  });

  it('lehnt einen nicht-bidirektionalen Weltgraph ab', () => {
    const config = clone();
    config.worldGraph.locations[0]!.connections.push({ to: 999, travelTicks: 1 });
    expect(() => parseConfig(config)).toThrow(ValidationError);
  });

  it('lehnt einen nicht zusammenhängenden Weltgraph ab', () => {
    const config = clone();
    config.worldGraph.locations.push({ id: 99, name: 'Isolated', connections: [] });
    expect(() => parseConfig(config)).toThrow(ValidationError);
  });

  it('lehnt doppelt vergebene BuildingId ab', () => {
    const config = clone();
    config.worldGraph.buildings.push({ id: config.worldGraph.buildings[0]!.id, kind: 'House', locationId: 1 });
    expect(() => parseConfig(config)).toThrow(ValidationError);
  });

  it('lehnt Building mit unbekannter LocationId ab', () => {
    const config = clone();
    config.worldGraph.buildings.push({ id: 999, kind: 'House', locationId: 12345 });
    expect(() => parseConfig(config)).toThrow(ValidationError);
  });

  it('lehnt strukturell ungültige Config ab (zod-Formfehler)', () => {
    expect(() => parseConfig({ seed: 'not-a-number' })).toThrow(ValidationError);
  });

  // v2, Subtask 9 §7: initiale Rollenstückzahlen dürfen initialPopulation.humans
  // nicht überschreiten (config/validate.ts checkRoles).
  it('lehnt initialPopulation.roles ab, deren Summe humans überschreitet', () => {
    const config = clone();
    config.initialPopulation.roles = { farmers: config.initialPopulation.humans, lumberjacks: 1 };
    expect(() => parseConfig(config)).toThrow(ValidationError);
  });

  it('akzeptiert initialPopulation.roles, deren Summe genau humans entspricht', () => {
    const config = clone();
    config.initialPopulation.roles = { farmers: 1, lumberjacks: config.initialPopulation.humans - 1 };
    expect(() => parseConfig(config)).not.toThrow();
  });

  // v2, Subtask 9 §16/V2-I7: minRatio muss kleiner als maxRatio sein
  // (config/validate.ts checkSupplyDemand).
  it('lehnt economy.supplyDemand mit minRatio >= maxRatio ab', () => {
    const config = clone();
    config.economy.supplyDemand.minRatio = 4;
    config.economy.supplyDemand.maxRatio = 4;
    expect(() => parseConfig(config)).toThrow(ValidationError);
  });
});
