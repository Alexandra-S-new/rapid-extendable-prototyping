import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { SimulationController } from '../../src/application/SimulationController.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { MemoryRawStorage } from '../helpers/MemoryRawStorage.js';
import { makeTestConfig } from '../helpers/testConfig.js';

// Determinismus der Observation Layer (Subtask 20, gemäß Subtask 19 §32.13
// Punkt 6): gleicher Seed + gleiche Config + gleiche Tick-Anzahl + gleiche
// Command-Sequenz auf zwei unabhängigen SimulationController-Instanzen muss
// strukturell identische WorldSnapshots liefern. Reproduktion bleibt aktiv
// (Default aus makeTestConfig()), um auch friendIds/partnerId/Geburten im
// Snapshot-Vergleich mit abzudecken.

function makeController(): SimulationController {
  const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
  return new SimulationController(engine, new ConsoleLogger('error'));
}

describe('Determinismus der Observation Layer', () => {
  it('zwei unabhängige Controller liefern nach identischer Command-Sequenz identische WorldSnapshots', () => {
    const controllerA = makeController();
    const controllerB = makeController();

    // Identische Sequenz aus Step-Commands (Application-Layer-Befehle,
    // keine Wall-Clock-Beteiligung, s. Subtask 19 §32.13).
    controllerA.step(20);
    controllerB.step(20);
    controllerA.step(15);
    controllerB.step(15);

    const snapshotA = controllerA.getObserver().getWorldSnapshot();
    const snapshotB = controllerB.getObserver().getWorldSnapshot();

    expect(snapshotA).toEqual(snapshotB);
    expect(snapshotA.tick).toBe(35);
  });

  it('Speichern/Laden über den Controller und Fortsetzen bleibt bei der Beobachtung deterministisch', () => {
    const storageA = new MemoryRawStorage();
    const storageB = new MemoryRawStorage();

    const direct = makeController();
    direct.step(50);

    const interrupted = makeController();
    interrupted.step(30);
    interrupted.save('/mid.json', storageA, '2026-01-01T00:00:00.000Z');
    interrupted.load('/mid.json', storageA);
    interrupted.step(20);

    expect(interrupted.getObserver().getWorldSnapshot()).toEqual(direct.getObserver().getWorldSnapshot());
    // storageB unbenutzt: nur zur Absicherung, dass load() tatsächlich aus
    // storageA liest, nicht aus einer versehentlich globalen Quelle.
    expect(() => storageB.read('/mid.json')).toThrow();
  });

  it('unterschiedliche Seeds erzeugen (mit sehr hoher Wahrscheinlichkeit) unterschiedliche Snapshots', () => {
    const controllerA = new SimulationController(
      SimulationEngine.create(makeTestConfig({ seed: 1 }), new ConsoleLogger('error')),
      new ConsoleLogger('error'),
    );
    const controllerB = new SimulationController(
      SimulationEngine.create(makeTestConfig({ seed: 2 }), new ConsoleLogger('error')),
      new ConsoleLogger('error'),
    );

    controllerA.step(50);
    controllerB.step(50);

    expect(controllerA.getObserver().getWorldSnapshot()).not.toEqual(controllerB.getObserver().getWorldSnapshot());
  });
});
