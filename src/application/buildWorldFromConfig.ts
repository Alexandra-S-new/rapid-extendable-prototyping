import { createWorld } from '../world/createWorld.js';
import { asLocationId, asBuildingId } from '../domain/value-objects/ids.js';
import type { WorldState } from '../world/WorldState.js';
import type { SimulationConfig } from '../config/schema.js';

// buildWorldFromConfig (Subtask 2 §2 "Welterzeugung"): mappt die
// unbrandeten Config-IDs (config/ liefert plain number, s. config/schema.ts)
// auf die gebrandeten Domain-IDs, die world/createWorld.ts erwartet. Reine
// Adapter-Funktion in application/, da config/ nicht von world/ abhängen darf
// und world/ nicht von config/ (02 §16 Dependency-Richtung).
export function buildWorldFromConfig(config: SimulationConfig): WorldState {
  return createWorld({
    masterSeed: config.seed,
    locations: config.worldGraph.locations.map((l) => ({
      id: asLocationId(l.id),
      name: l.name,
      connections: l.connections.map((c) => ({ to: asLocationId(c.to), travelTicks: c.travelTicks })),
      ...(l.capacity !== undefined ? { capacity: l.capacity } : {}),
    })),
    buildings: config.worldGraph.buildings.map((b) => ({
      id: asBuildingId(b.id),
      kind: b.kind,
      locationId: asLocationId(b.locationId),
    })),
    initialPopulation: config.initialPopulation,
    eventHistoryCapacity: config.observability.eventHistoryCapacity,
    // v2, ADR-V2-06: initiale Personen starten als Erwachsene, um das in
    // Subtask 9 identifizierte garantierte Massensterben der Startpopulation
    // (Altersgate + fehlende Eltern) zu verhindern. Neugeborene bleiben
    // davon unberührt (PopulationSystem startet sie weiterhin bei 0).
    initialAdultAgeTicks: config.reproduction.minAdultAgeTicks,
  });
}
