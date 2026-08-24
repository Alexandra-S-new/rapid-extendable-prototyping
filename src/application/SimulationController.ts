import { SimulationEngine } from './SimulationEngine.js';
import { WorldObserver } from '../observability/WorldObserver.js';
import { toWorldStateReader } from '../world/WorldState.js';
import { TickScheduler } from './TickScheduler.js';
import type { Logger, RawStorage } from '../world/ports.js';
import type { SimulationConfig } from '../config/schema.js';

export type ControllerState = 'stopped' | 'running' | 'paused';

export interface ControllerStatus {
  readonly state: ControllerState;
  readonly currentTick: number;
  readonly ticksPerSecond: number;
}

const DEFAULT_TICKS_PER_SECOND = 1;

// SimulationController (Subtask 20, gemäß Subtask 19 §32.6/§32.7/§32.10):
// Application-Layer-Fassade um die unveränderte SimulationEngine. Besitzt
// den TickScheduler, kapselt Lifecycle (Start/Pause/Resume/Step/Speed) und
// delegiert Save/Load unverändert an die bestehende SimulationEngine — keine
// eigene Persistenzlogik. Einziger nach außen exponierter Welt-Zugriff ist
// getObserver() (liefert einen frischen WorldObserver, s.
// observability/WorldObserver.ts) bzw. getStatus() (nur Primitive) — niemals
// der rohe WorldState, damit eine Presentation-Schicht strukturell keine
// direkten Domain-Mutationen vornehmen kann (Subtask 20 Vorgabe).
export class SimulationController {
  private engine: SimulationEngine;
  private readonly scheduler: TickScheduler;
  private readonly logger: Logger;
  private state: ControllerState = 'stopped';
  private ticksPerSecond: number;

  constructor(engine: SimulationEngine, logger: Logger, ticksPerSecond: number = DEFAULT_TICKS_PER_SECOND) {
    this.engine = engine;
    this.logger = logger;
    this.ticksPerSecond = ticksPerSecond;
    this.scheduler = new TickScheduler(intervalMsFor(ticksPerSecond));
  }

  start(): void {
    if (this.state === 'running') return;
    this.state = 'running';
    this.scheduler.start(() => this.engine.tick());
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.scheduler.stop();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.start();
  }

  // Einzelschritt ist unabhängig vom Scheduler und in jedem Zustand
  // zulässig (auch 'stopped'/'running') — direkte, synchrone Delegation an
  // die bereits bestehende engine.run() (Subtask 19 §32.7 Lifecycle).
  step(ticks = 1): void {
    this.engine.run(ticks);
  }

  setSpeed(ticksPerSecond: number): void {
    assertPositiveFinite(ticksPerSecond);
    this.ticksPerSecond = ticksPerSecond;
    this.scheduler.setIntervalMs(intervalMsFor(ticksPerSecond));
  }

  getStatus(): ControllerStatus {
    return {
      state: this.state,
      currentTick: this.engine.getWorld().clock.currentTick,
      ticksPerSecond: this.ticksPerSecond,
    };
  }

  getObserver(): WorldObserver {
    return new WorldObserver(toWorldStateReader(this.engine.getWorld()), this.engine.getConfig());
  }

  save(path: string, storage: RawStorage, createdAt: string): void {
    this.engine.save(path, storage, createdAt);
  }

  // Ersetzt die intern gehaltene Engine vollständig durch eine frisch
  // geladene Instanz (construct-then-swap, bestehende Regel aus
  // SimulationEngine.loadFrom) — niemals In-Place-Mutation des WorldState.
  // Ein laufender Scheduler wird zuvor angehalten, damit kein Tick mehr auf
  // die alte Engine feuert, während die neue geladen wird.
  load(path: string, storage: RawStorage): void {
    const wasRunning = this.state === 'running';
    if (wasRunning) this.scheduler.stop();
    this.engine = SimulationEngine.loadFrom(path, storage, this.logger);
    this.state = 'paused';
    if (wasRunning) this.start();
  }

  // restart (Subtask 25 §9.2): dieselbe construct-then-swap-Regel wie load()
  // — ersetzt die Engine vollständig durch eine frische, über
  // buildWorldFromConfig/SimulationEngine.create() neu erzeugte Instanz,
  // statt eine Datei zu lesen. Kein neuer Mechanismus, keine neue
  // Persistenzlogik — lediglich dieselbe Engine-Erzeugung, die bereits
  // beim allerersten Start verwendet wird (SimulationEngine.create), jetzt
  // auch zur Laufzeit erreichbar. Welche SimulationConfig (insbesondere
  // welcher seed) das ist, entscheidet die Presentation-Schicht (Subtask 25
  // §9.3) — der Controller selbst trifft keine Seed-Entscheidung.
  restart(config: SimulationConfig): void {
    const wasRunning = this.state === 'running';
    if (wasRunning) this.scheduler.stop();
    this.engine = SimulationEngine.create(config, this.logger);
    this.state = 'paused';
    if (wasRunning) this.start();
  }
}

function intervalMsFor(ticksPerSecond: number): number {
  return 1000 / ticksPerSecond;
}

function assertPositiveFinite(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('ticksPerSecond must be a positive, finite number');
  }
}
