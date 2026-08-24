import { describe, it, expect } from 'vitest';
import { WorldObserver } from '../../src/observability/WorldObserver.js';
import { toWorldStateReader } from '../../src/world/WorldState.js';
import { defaultConfig } from '../../src/config/defaults.js';
import { asLocationId } from '../../src/domain/value-objects/ids.js';
import { buildTestWorld } from '../helpers/testWorld.js';

// getLocationGraph() (Subtask 23 §13): minimale, rein durchreichende
// Erweiterung der Observation Layer, begründet und dokumentiert im
// Abschlussbericht — separat von tests/observability/world-observer.test.ts,
// um die bestehende Testdatei unangetastet zu lassen.

describe('WorldObserver.getLocationGraph()', () => {
  it('gibt id/name/connections unverändert aus environment.locations wieder', () => {
    const world = buildTestWorld();
    const observer = new WorldObserver(toWorldStateReader(world), defaultConfig);

    const graph = observer.getLocationGraph();

    expect(graph).toEqual([
      { id: asLocationId(1), name: 'A', connections: [{ to: asLocationId(2), travelTicks: 2 }] },
      { id: asLocationId(2), name: 'B', connections: [{ to: asLocationId(1), travelTicks: 2 }] },
    ]);
  });

  it('liefert unabhängige Kopien (Mutation beeinflusst weder den WorldState noch spätere Aufrufe)', () => {
    const world = buildTestWorld();
    const observer = new WorldObserver(toWorldStateReader(world), defaultConfig);

    const graph = observer.getLocationGraph();
    (graph[0]!.connections as unknown[]).push({ to: asLocationId(99), travelTicks: 1 });

    expect(world.environment.locations[0]!.connections).toHaveLength(1);
    expect(observer.getLocationGraph()[0]!.connections).toHaveLength(1);
  });

  it('bleibt nach einem construct-then-swap (Load-Analogie) mit dem jeweils aktuellen WorldState synchron', () => {
    const worldA = buildTestWorld();
    const worldB = buildTestWorld({
      locations: [{ id: asLocationId(5), name: 'Neu', connections: [], buildingIds: [] }],
    });

    const observerA = new WorldObserver(toWorldStateReader(worldA), defaultConfig);
    const observerB = new WorldObserver(toWorldStateReader(worldB), defaultConfig);

    expect(observerA.getLocationGraph().map((l) => l.id)).toEqual([asLocationId(1), asLocationId(2)]);
    expect(observerB.getLocationGraph().map((l) => l.id)).toEqual([asLocationId(5)]);
  });
});
