import type { LocationId } from '../domain/value-objects/ids.js';
import type { Location } from '../domain/environment.js';

// PathTable (Subtask 2 §10): einmalig bei Welterzeugung berechnete
// All-Pairs-Shortest-Path-Tabelle (Floyd-Warshall, bei ~10-30 Orten trivial).
// Kein Pro-Tick-Algorithmus, kein generisches Laufzeit-Pathfinding-System.
// Rein abgeleitet aus dem statischen Location-Graphen — nicht Teil von
// WorldState/SaveFile, nach jedem Laden aus environment.locations neu
// berechnet (billig, deterministisch, immer aktuell).
export class PathTable {
  private constructor(
    private readonly nextHop: Map<LocationId, Map<LocationId, LocationId>>,
  ) {}

  static build(locations: readonly Location[]): PathTable {
    const ids = locations.map((l) => l.id);
    const dist = new Map<LocationId, Map<LocationId, number>>();
    const next = new Map<LocationId, Map<LocationId, LocationId>>();

    for (const a of ids) {
      dist.set(a, new Map());
      next.set(a, new Map());
      for (const b of ids) {
        dist.get(a)!.set(b, a === b ? 0 : Infinity);
      }
    }

    for (const location of locations) {
      for (const connection of location.connections) {
        const current = dist.get(location.id)!.get(connection.to) ?? Infinity;
        if (connection.travelTicks < current) {
          dist.get(location.id)!.set(connection.to, connection.travelTicks);
          next.get(location.id)!.set(connection.to, connection.to);
        }
      }
    }

    for (const k of ids) {
      for (const i of ids) {
        const dik = dist.get(i)!.get(k)!;
        if (dik === Infinity) continue;
        for (const j of ids) {
          const dkj = dist.get(k)!.get(j)!;
          if (dkj === Infinity) continue;
          const current = dist.get(i)!.get(j)!;
          if (dik + dkj < current) {
            dist.get(i)!.set(j, dik + dkj);
            next.get(i)!.set(j, next.get(i)!.get(k)!);
          }
        }
      }
    }

    return new PathTable(next);
  }

  // Vollständiger Pfad inkl. Zielort, exklusive Startort; leer, wenn from===to
  // oder kein Pfad existiert.
  pathBetween(from: LocationId, to: LocationId): LocationId[] {
    if (from === to) return [];
    const path: LocationId[] = [];
    let current = from;
    const nextFromCurrent = this.nextHop.get(current);
    if (!nextFromCurrent || !nextFromCurrent.has(to)) return [];
    while (current !== to) {
      const hop = this.nextHop.get(current)?.get(to);
      if (hop === undefined) return [];
      path.push(hop);
      current = hop;
    }
    return path;
  }
}
