import { ValidationError } from '../domain/errors.js';
import { simulationConfigSchema, type SimulationConfig } from './schema.js';

// Config-Validierung (Subtask 2 §17, Subtask 3.5, Subtask 3.8, verbindlich):
// zod-Formvalidierung + Weltgraph-Validierung (Bidirektionalität,
// Zusammenhang) + Building-Validierung (Eindeutigkeit, gültige Referenz).
// Alle semantischen Verstöße -> ValidationError(source: 'config'), nie ein
// Laufzeitfehler (02 §17 / 03 §15).

export function parseConfig(raw: unknown): SimulationConfig {
  const result = simulationConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ValidationError('config', issues);
  }

  const config = result.data;
  const issues = [...checkWorldGraph(config), ...checkBuildings(config), ...checkRoles(config), ...checkSupplyDemand(config)];
  if (issues.length > 0) {
    throw new ValidationError('config', issues);
  }

  return config;
}

function checkWorldGraph(config: SimulationConfig): string[] {
  const issues: string[] = [];
  const { locations } = config.worldGraph;
  const locationIds = new Set(locations.map((l) => l.id));

  // Bidirektionalität: A->B impliziert B->A (Subtask 3 §5.1, verbindlich).
  const edges = new Set<string>();
  for (const location of locations) {
    for (const connection of location.connections) {
      if (!locationIds.has(connection.to)) {
        issues.push(`worldGraph.locations: Location ${location.id} referenziert unbekannte Location ${connection.to}`);
        continue;
      }
      edges.add(`${location.id}->${connection.to}`);
    }
  }
  for (const location of locations) {
    for (const connection of location.connections) {
      if (!edges.has(`${connection.to}->${location.id}`)) {
        issues.push(`worldGraph.locations: Verbindung ${location.id}->${connection.to} ist nicht bidirektional`);
      }
    }
  }

  // Zusammenhang: von jedem Ort muss jeder andere Ort erreichbar sein.
  if (locations.length > 0) {
    const adjacency = new Map<number, number[]>();
    for (const location of locations) {
      adjacency.set(location.id, location.connections.map((c) => c.to));
    }
    const start = locations[0]!.id;
    const visited = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (visited.size !== locationIds.size) {
      issues.push('worldGraph.locations: Weltgraph ist nicht zusammenhängend');
    }
  }

  return issues;
}

function checkBuildings(config: SimulationConfig): string[] {
  const issues: string[] = [];
  const locationIds = new Set(config.worldGraph.locations.map((l) => l.id));
  const seenBuildingIds = new Set<number>();

  for (const building of config.worldGraph.buildings) {
    if (seenBuildingIds.has(building.id)) {
      issues.push(`worldGraph.buildings: BuildingId ${building.id} ist mehrfach vergeben`);
    }
    seenBuildingIds.add(building.id);

    if (!locationIds.has(building.locationId)) {
      issues.push(`worldGraph.buildings: Building ${building.id} referenziert unbekannte Location ${building.locationId}`);
    }
  }

  return issues;
}

// v2, Subtask 9 §7: initiale Rollenstückzahlen dürfen die Gesamtpopulation
// nicht überschreiten.
function checkRoles(config: SimulationConfig): string[] {
  const roles = config.initialPopulation.roles;
  if (!roles) return [];
  const total = roles.farmers + roles.lumberjacks;
  if (total > config.initialPopulation.humans) {
    return [`initialPopulation.roles: Summe (${total}) überschreitet initialPopulation.humans (${config.initialPopulation.humans})`];
  }
  return [];
}

// v2, Subtask 9 §16/V2-I7: Preisgrenzen müssen eine gültige Spanne bilden.
function checkSupplyDemand(config: SimulationConfig): string[] {
  const { minRatio, maxRatio } = config.economy.supplyDemand;
  if (minRatio >= maxRatio) {
    return [`economy.supplyDemand: minRatio (${minRatio}) muss kleiner als maxRatio (${maxRatio}) sein`];
  }
  return [];
}
