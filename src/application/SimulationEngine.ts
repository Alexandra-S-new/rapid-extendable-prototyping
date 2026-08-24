import { RngOrchestrator } from '../world/rng/RngOrchestrator.js';
import { PathTable } from '../world/PathTable.js';
import { Mulberry32RandomSource } from '../random/Mulberry32RandomSource.js';
import { FixedRatioMarket } from '../simulation/economy/FixedRatioMarket.js';
import { SupplyDemandMarket } from '../simulation/economy/SupplyDemandMarket.js';
import type { Market } from '../simulation/economy/Market.js';
import { createBaselineActions } from '../simulation/decision/actions/index.js';
import {
  runTimeSystem,
  runWeatherSystem,
  runMaintenanceSystem,
  runProductionSystem,
  runNeedsSystem,
  runMovementSystem,
  runActionExecutionSystem,
  runPopulationSystem,
  runSocialBondingSystem,
  runEventResolutionSystem,
  runCleanupSystem,
} from '../simulation/systems/index.js';
import { runDecisionSystem } from '../simulation/decision/DecisionSystem.js';
import type { Action } from '../simulation/decision/Action.js';
import type { TickContext } from '../simulation/TickContext.js';
import type { WorldState } from '../world/WorldState.js';
import type { SimulationConfig } from '../config/schema.js';
import type { Logger, RawStorage } from '../world/ports.js';
import type { EmittedEvent } from '../domain/events.js';
import { buildWorldFromConfig } from './buildWorldFromConfig.js';
import { save as persistSave } from '../persistence/save.js';
import { load as persistLoad } from '../persistence/load.js';

const ENGINE_VERSION = '0.1.0';

// SimulationEngine (Subtask 2 §2/§16): besitzt die Tick-Schleife,
// orchestriert Persistence/Config/Observability. Einzige Stelle außerhalb
// der Tick-Schleife, die WorldState komplett ersetzt (construct-then-swap
// bei load(), Subtask 2 §4 Mutationsregel 4).
export class SimulationEngine {
  private world: WorldState;
  private config: SimulationConfig;
  private ctx: TickContext;
  private actions: Action[];
  private actionsById: Map<string, Action>;

  private constructor(world: WorldState, config: SimulationConfig, logger: Logger) {
    this.world = world;
    this.config = config;
    const rng = new RngOrchestrator(world.rng, (state) => new Mulberry32RandomSource(state));
    // v2, ADR-V2-05: Market-Strategie über config.economy.market wählbar;
    // Default 'FixedRatio' entspricht exakt dem v1-Verhalten.
    const market: Market =
      config.economy.market === 'SupplyDemand'
        ? new SupplyDemandMarket(config.economy.supplyDemand)
        : new FixedRatioMarket(config.economy.marketExchangeRatio);
    this.actions = createBaselineActions(config, market);
    this.actionsById = new Map(this.actions.map((a) => [a.id as string, a]));
    const pathTable = PathTable.build(world.environment.locations);

    this.ctx = {
      config,
      logger,
      rng,
      pathTable,
      emit: (event: EmittedEvent) => this.emit(event),
    };
  }

  static create(config: SimulationConfig, logger: Logger): SimulationEngine {
    const world = buildWorldFromConfig(config);
    return new SimulationEngine(world, config, logger);
  }

  static loadFrom(path: string, storage: RawStorage, logger: Logger): SimulationEngine {
    const { world, config } = persistLoad(path, storage);
    return new SimulationEngine(world, config, logger);
  }

  getWorld(): WorldState {
    return this.world;
  }

  getConfig(): SimulationConfig {
    return this.config;
  }

  private emit(event: EmittedEvent): void {
    const sequence = this.world.events.nextSequence;
    this.world.events.nextSequence += 1;
    this.world.events.pending.push({ ...event, sequence, tick: this.world.clock.currentTick } as never);
  }

  tick(): void {
    this.world.clock.currentTick += 1;

    // Perception
    runTimeSystem(this.world, this.ctx);
    runWeatherSystem(this.world, this.ctx);
    runMaintenanceSystem(this.world, this.ctx);
    runProductionSystem(this.world, this.ctx);
    runNeedsSystem(this.world, this.ctx);

    // Decision
    runDecisionSystem(this.world, this.ctx, this.actions);

    // Action
    runMovementSystem(this.world, this.ctx);
    runActionExecutionSystem(this.world, this.ctx, this.actionsById);

    // Resolution
    runPopulationSystem(this.world, this.ctx);
    runSocialBondingSystem(this.world, this.ctx);
    runEventResolutionSystem(this.world);

    // Cleanup
    runCleanupSystem(this.world);
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      this.tick();
    }
  }

  save(path: string, storage: RawStorage, createdAt: string): void {
    persistSave(path, this.world, this.config, storage, ENGINE_VERSION, createdAt);
  }
}
