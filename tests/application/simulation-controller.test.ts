import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimulationController } from '../../src/application/SimulationController.js';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { WorldObserver } from '../../src/observability/WorldObserver.js';
import { makeTestConfig } from '../helpers/testConfig.js';
import { MemoryRawStorage } from '../helpers/MemoryRawStorage.js';

// SimulationController (Subtask 20, gemäß Subtask 19 §32.6/§32.7/§32.10):
// Lifecycle- und Delegationstests. Der Scheduler wird über
// vitest-Fake-Timer angesteuert (keine echte Wartezeit nötig).

function makeController(): SimulationController {
  const engine = SimulationEngine.create(makeTestConfig({ reproduction: { minAdultAgeTicks: 10, birthProbabilityPerEligiblePair: 0, crisisThreshold: 30 } }), new ConsoleLogger('error'));
  return new SimulationController(engine, new ConsoleLogger('error'));
}

describe('SimulationController — Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startet im Zustand "stopped" bei Tick 0', () => {
    const controller = makeController();
    const status = controller.getStatus();
    expect(status.state).toBe('stopped');
    expect(status.currentTick).toBe(0);
  });

  it('start() versetzt in "running" und lässt den Scheduler Ticks anstoßen', () => {
    const controller = makeController();
    controller.setSpeed(10); // 10 Ticks/s -> 100ms/Tick
    controller.start();
    expect(controller.getStatus().state).toBe('running');

    vi.advanceTimersByTime(350);

    expect(controller.getStatus().currentTick).toBe(3);
  });

  it('pause() hält den Scheduler an, currentTick bleibt danach stabil', () => {
    const controller = makeController();
    controller.setSpeed(10);
    controller.start();
    vi.advanceTimersByTime(200);
    controller.pause();
    const tickAtPause = controller.getStatus().currentTick;

    vi.advanceTimersByTime(1000);

    expect(controller.getStatus().state).toBe('paused');
    expect(controller.getStatus().currentTick).toBe(tickAtPause);
  });

  it('resume() setzt einen pausierten Lauf fort', () => {
    const controller = makeController();
    controller.setSpeed(10);
    controller.start();
    vi.advanceTimersByTime(100);
    controller.pause();
    const tickAtPause = controller.getStatus().currentTick;

    controller.resume();
    expect(controller.getStatus().state).toBe('running');
    vi.advanceTimersByTime(300);

    expect(controller.getStatus().currentTick).toBeGreaterThan(tickAtPause);
  });

  it('pause()/resume()/start() sind bei bereits passendem Zustand idempotent (kein Fehler)', () => {
    const controller = makeController();
    expect(() => controller.pause()).not.toThrow(); // pause im Zustand 'stopped'
    expect(() => controller.resume()).not.toThrow(); // resume im Zustand 'stopped'
    controller.start();
    expect(() => controller.start()).not.toThrow(); // start im Zustand 'running'
  });

  it('step(n) funktioniert unabhängig vom Scheduler-Zustand, auch ohne start()', () => {
    const controller = makeController();
    controller.step(5);
    expect(controller.getStatus().currentTick).toBe(5);
    expect(controller.getStatus().state).toBe('stopped');
  });

  it('step() ohne Argument führt genau einen Tick aus', () => {
    const controller = makeController();
    controller.step();
    expect(controller.getStatus().currentTick).toBe(1);
  });

  it('setSpeed() ändert die Kadenz eines laufenden Schedulers ohne den Tick-Inhalt zu beeinflussen', () => {
    const controller = makeController();
    controller.setSpeed(1);
    controller.start();
    vi.advanceTimersByTime(1000);
    expect(controller.getStatus().currentTick).toBe(1);

    controller.setSpeed(100); // 10ms/Tick
    vi.advanceTimersByTime(50);
    expect(controller.getStatus().currentTick).toBe(6);
    expect(controller.getStatus().ticksPerSecond).toBe(100);
  });

  it('setSpeed() lehnt nicht-positive Werte ab', () => {
    const controller = makeController();
    expect(() => controller.setSpeed(0)).toThrow(RangeError);
    expect(() => controller.setSpeed(-1)).toThrow(RangeError);
  });

  it('getObserver() liefert einen funktionsfähigen WorldObserver ohne direkten WorldState-Zugriff', () => {
    const controller = makeController();
    controller.step(3);
    const observer = controller.getObserver();
    expect(observer).toBeInstanceOf(WorldObserver);
    expect(observer.getWorldSnapshot().tick).toBe(3);
  });
});

describe('SimulationController — Save/Load (Subtask 20 §32.14)', () => {
  it('save()/load() delegieren unverändert an die bestehende SimulationEngine-Persistenz', () => {
    const storage = new MemoryRawStorage();
    const controller = makeController();
    controller.step(7);
    controller.save('/save.json', storage, '2026-01-01T00:00:00.000Z');

    const loadedController = makeController();
    loadedController.load('/save.json', storage);

    expect(loadedController.getStatus().currentTick).toBe(7);
    expect(loadedController.getStatus().state).toBe('paused');
  });

  it('load() ersetzt die Engine vollständig (construct-then-swap) und lässt einen laufenden Scheduler nach dem Laden fortsetzen', () => {
    vi.useFakeTimers();
    const storage = new MemoryRawStorage();
    const source = makeController();
    source.step(4);
    source.save('/save.json', storage, '2026-01-01T00:00:00.000Z');

    const controller = makeController();
    controller.setSpeed(10);
    controller.start();
    vi.advanceTimersByTime(100); // currentTick = 1 vor dem Laden

    controller.load('/save.json', storage);
    expect(controller.getStatus().currentTick).toBe(4);
    expect(controller.getStatus().state).toBe('running');

    vi.advanceTimersByTime(200);
    expect(controller.getStatus().currentTick).toBeGreaterThan(4);
    vi.useRealTimers();
  });

  it('load() eines pausierten Controllers bleibt pausiert (kein automatischer Neustart)', () => {
    const storage = new MemoryRawStorage();
    const source = makeController();
    source.step(2);
    source.save('/save.json', storage, '2026-01-01T00:00:00.000Z');

    const controller = makeController();
    controller.load('/save.json', storage);

    expect(controller.getStatus().state).toBe('paused');
    expect(controller.getStatus().currentTick).toBe(2);
  });
});

describe('SimulationController — Integration Simulation -> Observation (Subtask 20 §32.8)', () => {
  it('getObserver().getWorldSnapshot() spiegelt echte Tick-Fortschritte wider', () => {
    const controller = makeController();
    const before = controller.getObserver().getWorldSnapshot();
    expect(before.tick).toBe(0);

    controller.step(10);

    const after = controller.getObserver().getWorldSnapshot();
    expect(after.tick).toBe(10);
    expect(after.people.length).toBeGreaterThan(0);
  });
});
