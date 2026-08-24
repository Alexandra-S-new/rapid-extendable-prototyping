import type { LocationId } from '../domain/value-objects/ids.js';
import type { WorldState } from '../world/WorldState.js';

// travelTicksBetween (Subtask 2 §10): Kantengewicht zwischen zwei direkt
// verbundenen Orten. Fällt auf 1 zurück, falls keine direkte Verbindung
// gefunden wird (sollte bei einem aus PathTable stammenden Pfad nicht
// vorkommen, da PathTable nur entlang existierender Kanten baut).
export function travelTicksBetween(world: WorldState, from: LocationId, to: LocationId): number {
  const location = world.environment.locations.find((l) => l.id === from);
  const connection = location?.connections.find((c) => c.to === to);
  return connection?.travelTicks ?? 1;
}
