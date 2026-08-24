import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/world/createWorld.js';
import { createWorkAction } from '../../src/simulation/decision/actions/Work.js';
import { toWorldStateReader } from '../../src/world/WorldState.js';
import { asLocationId, asBuildingId } from '../../src/domain/value-objects/ids.js';

// Rollen (v2, Subtask 9 §7/ADR-V2-04): initiale, unveränderliche
// Rollenzuweisung bei der Welterzeugung + rollenbasierte Zielpräferenz in
// Work.chooseWorkTarget (nur wirksam, wenn am aktuellen Ort noch kein
// passendes Gebäude existiert — s. Kommentar in Work.ts).

describe('Rollenzuweisung bei der Welterzeugung (Subtask 9 §7)', () => {
  it('vergibt Farmer/Lumberjack an die ersten N Personen in Erzeugungsreihenfolge, der Rest bleibt rollenlos', () => {
    const world = createWorld({
      masterSeed: 1,
      locations: [{ id: asLocationId(1), name: 'A', connections: [] }],
      buildings: [],
      initialPopulation: { humans: 3, animals: 0, roles: { farmers: 1, lumberjacks: 1 } },
      eventHistoryCapacity: 10,
    });

    const [first, second, third] = world.entities.alive;
    expect(world.components.identity.get(first!)!.role).toBe('Farmer');
    expect(world.components.identity.get(second!)!.role).toBe('Lumberjack');
    expect(world.components.identity.get(third!)!.role).toBeUndefined();
  });

  it('ohne roles-Konfiguration bleiben alle Personen rollenlos (v1-Verhalten)', () => {
    const world = createWorld({
      masterSeed: 1,
      locations: [{ id: asLocationId(1), name: 'A', connections: [] }],
      buildings: [],
      initialPopulation: { humans: 2, animals: 0 },
      eventHistoryCapacity: 10,
    });

    for (const id of world.entities.alive) {
      expect(world.components.identity.get(id)!.role).toBeUndefined();
    }
  });
});

describe('Rollenbasierte Zielpräferenz in Work (ADR-V2-04)', () => {
  it('ein Lumberjack ohne lokal erreichbares Gebäude bevorzugt den Workplace vor dem niedriger-IDigen Field', () => {
    const world = createWorld({
      masterSeed: 1,
      locations: [
        { id: asLocationId(1), name: 'Village', connections: [{ to: asLocationId(2), travelTicks: 1 }, { to: asLocationId(3), travelTicks: 1 }] },
        { id: asLocationId(2), name: 'Field', connections: [{ to: asLocationId(1), travelTicks: 1 }] },
        { id: asLocationId(3), name: 'Workplace', connections: [{ to: asLocationId(1), travelTicks: 1 }] },
      ],
      buildings: [
        { id: asBuildingId(1), kind: 'Field', locationId: asLocationId(2) },
        { id: asBuildingId(2), kind: 'Workplace', locationId: asLocationId(3) },
      ],
      initialPopulation: { humans: 1, animals: 0, roles: { farmers: 0, lumberjacks: 1 } },
      eventHistoryCapacity: 10,
    });
    world.environment.buildings[0]!.inventory.Food = 10;
    world.environment.buildings[1]!.inventory.Wood = 10;
    // Person startet round-robin an Location 1 (Village, ohne passendes
    // Gebäude), muss also gemäß Rollenpräferenz zum Workplace (Location 3)
    // reisen statt zum niedriger-IDigen Field (Location 2).
    const [person] = world.entities.alive;
    const work = createWorkAction({ workTransferPerTick: 5, minAdultAgeTicks: 0 });

    expect(work.requiredLocation!(person!, toWorldStateReader(world))).toBe(3);
  });
});
