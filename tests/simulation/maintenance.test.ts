import { describe, it, expect } from 'vitest';
import { runMaintenanceSystem } from '../../src/simulation/systems/MaintenanceSystem.js';
import { runProductionSystem } from '../../src/simulation/systems/ProductionSystem.js';
import { buildTestWorld, buildTestContext, makeTestBuilding } from '../helpers/testWorld.js';

// MaintenanceSystem (v2, Subtask 9 §6/ADR-V2-03): Gebäudeverschleiß +
// self-funded Instandhaltung aus dem eigenen Wood-Bestand. V2-I4 (Klemmung
// [0,100]), V2-I5 (nur Field/Workplace betroffen), V2-I6 (Produktionsboden).

const MAINTENANCE_CONFIG = { conditionDecayPerTick: 20, woodPerConditionPoint: 1, minProductionMultiplier: 0.2 };

describe('Verschleiß (V2-I4: geklemmt auf [0, 100])', () => {
  it('condition sinkt pro Tick um conditionDecayPerTick, wenn kein Wood zur Reparatur vorhanden ist', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Field', 1)] });
    world.environment.buildings[0]!.condition = 100;
    const ctx = buildTestContext(world, { maintenance: MAINTENANCE_CONFIG });

    runMaintenanceSystem(world, ctx);

    expect(world.environment.buildings[0]!.condition).toBe(80);
  });

  it('condition wird nie unter 0 geklemmt', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Field', 1)] });
    world.environment.buildings[0]!.condition = 5;
    const ctx = buildTestContext(world, { maintenance: MAINTENANCE_CONFIG });

    runMaintenanceSystem(world, ctx);

    expect(world.environment.buildings[0]!.condition).toBe(0);
  });

  it('Gebäude ohne condition (z. B. House/Market) werden von MaintenanceSystem nicht verändert', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Market', 1)] });
    const before = { ...world.environment.buildings[0]! };
    const ctx = buildTestContext(world, { maintenance: MAINTENANCE_CONFIG });

    runMaintenanceSystem(world, ctx);

    expect(world.environment.buildings[0]).toEqual(before);
  });
});

describe('Self-funded Reparatur (ADR-V2-03)', () => {
  it('repariert aus dem eigenen Wood-Bestand und verbraucht ihn entsprechend woodPerConditionPoint', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Workplace', 1)] });
    const building = world.environment.buildings[0]!;
    building.condition = 50;
    building.inventory.Wood = 100;
    const ctx = buildTestContext(world, { maintenance: MAINTENANCE_CONFIG });

    runMaintenanceSystem(world, ctx);

    // Verschleiß zuerst: 50 -> 30. Defizit danach: 70. woodPerConditionPoint=1
    // -> 70 Wood benötigt, 100 vorhanden -> voll reparierbar auf 100.
    expect(building.condition).toBe(100);
    expect(building.inventory.Wood).toBe(30); // 100 - 70
  });

  it('reicht der Wood-Bestand nicht für die volle Reparatur, wird nur teilweise repariert und der Bestand auf 0 verbraucht', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Workplace', 1)] });
    const building = world.environment.buildings[0]!;
    building.condition = 50;
    building.inventory.Wood = 10;
    const ctx = buildTestContext(world, { maintenance: MAINTENANCE_CONFIG });

    runMaintenanceSystem(world, ctx);

    // Verschleiß zuerst: 50 -> 30. 10 Wood reparieren 10 Punkte -> 40.
    expect(building.condition).toBe(40);
    expect(building.inventory.Wood).toBe(0);
  });

  it('ohne Wood-Bestand findet keine Reparatur statt (reiner Verschleiß)', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Workplace', 1)] });
    const building = world.environment.buildings[0]!;
    building.condition = 50;
    building.inventory.Wood = 0;
    const ctx = buildTestContext(world, { maintenance: MAINTENANCE_CONFIG });

    runMaintenanceSystem(world, ctx);

    expect(building.condition).toBe(30);
    expect(building.inventory.Wood).toBe(0);
  });
});

describe('BuildingConditionChangedEvent (ADR-V2-08: nur bei Bandwechsel)', () => {
  it('emittiert ein Event, wenn die condition die Bandschwelle unterschreitet (healthy -> degraded)', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Field', 1)] });
    world.environment.buildings[0]!.condition = 71; // healthy (>= 70)
    const ctx = buildTestContext(world, { maintenance: { ...MAINTENANCE_CONFIG, conditionDecayPerTick: 5 } });

    runMaintenanceSystem(world, ctx);

    expect(world.environment.buildings[0]!.condition).toBe(66); // degraded (< 70)
    const event = world.events.pending.find((e) => e.type === 'BuildingConditionChangedEvent');
    expect(event).toBeDefined();
    expect(event?.type === 'BuildingConditionChangedEvent' && event.band).toBe('degraded');
  });

  it('emittiert kein Event, solange das Band unverändert bleibt', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Field', 1)] });
    world.environment.buildings[0]!.condition = 90; // healthy
    const ctx = buildTestContext(world, { maintenance: { ...MAINTENANCE_CONFIG, conditionDecayPerTick: 5 } });

    runMaintenanceSystem(world, ctx); // 90 -> 85, weiterhin healthy

    expect(world.events.pending.some((e) => e.type === 'BuildingConditionChangedEvent')).toBe(false);
  });
});

describe('Produktionsboden (V2-I6: ProductionSystem darf trotz schlechtem Zustand nie unter den konfigurierten Boden fallen)', () => {
  it('bei condition 0 sinkt der Multiplikator nicht unter minProductionMultiplier', () => {
    const world = buildTestWorld({ buildings: [makeTestBuilding(1, 'Field', 1)] });
    world.environment.buildings[0]!.condition = 0;
    const ctx = buildTestContext(world, {
      maintenance: MAINTENANCE_CONFIG,
      economy: {
        marketExchangeRatio: 1,
        productionBaseRate: { Food: 100, Wood: 100 },
        market: 'FixedRatio',
        supplyDemand: { elasticity: 0.5, minRatio: 0.5, maxRatio: 4 },
      },
    });

    runProductionSystem(world, ctx);

    // Bei condition 0 wäre ein reiner Faktor 0 -> kein Ertrag; V2-I6
    // garantiert stattdessen mindestens minProductionMultiplier (0.2) des
    // Basisertrags (vor Umwelt-/Varianzfaktoren).
    const harvest = world.events.pending.find((e) => e.type === 'HarvestEvent');
    expect(harvest).toBeDefined();
    expect(harvest?.type === 'HarvestEvent' && harvest.amount).toBeGreaterThan(0);
  });
});
