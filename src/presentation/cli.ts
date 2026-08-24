import { parseArgs } from 'node:util';
import { SimulationEngine } from '../application/SimulationEngine.js';
import { loadConfig, applyCliOverrides } from '../application/loadConfig.js';
import { FileRawStorage } from '../persistence/FileRawStorage.js';
import { ConsoleLogger } from '../observability/Logger.js';
import { computeStatistics } from '../observability/StatisticsReporter.js';
import { queryEventHistory } from '../observability/EventHistoryView.js';
import { inspectEntity } from '../observability/EntityInspector.js';
import { toWorldStateReader } from '../world/WorldState.js';
import { asEntityId } from '../domain/value-objects/ids.js';
import type { SimEventType } from '../domain/events.js';
import { ConfigurationError, PersistenceError, ValidationError, SimulationError } from '../domain/errors.js';

// presentation/cli.ts (Subtask 2 §18): argv-Parsing, Aufruf von
// application/, Formatierung der Ausgabe — keine Domänenlogik. Batch-Prozess,
// kein interaktives Pause/Resume (02 §18).

const storage = new FileRawStorage();

function runCommand(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: 'string' },
      ticks: { type: 'string' },
      config: { type: 'string' },
      load: { type: 'string' },
      save: { type: 'string' },
      humans: { type: 'string' },
      animals: { type: 'string' },
    },
  });

  const logger = new ConsoleLogger();
  const ticks = values.ticks ? parseInt(values.ticks, 10) : 0;

  const engine = values.load
    ? SimulationEngine.loadFrom(values.load, storage, logger)
    : SimulationEngine.create(
        applyCliOverrides(loadConfig(values.config, storage), {
          seed: values.seed ? parseInt(values.seed, 10) : undefined,
          humans: values.humans ? parseInt(values.humans, 10) : undefined,
          animals: values.animals ? parseInt(values.animals, 10) : undefined,
        }),
        logger,
      );

  engine.run(ticks);
  console.log(`Ran ${ticks} ticks. currentTick=${engine.getWorld().clock.currentTick}`);

  if (values.save) {
    engine.save(values.save, storage, new Date().toISOString());
    console.log(`Saved to ${values.save}`);
  }
}

function inspectCommand(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { load: { type: 'string' }, entity: { type: 'string' } },
  });
  if (!values.load || !values.entity) {
    throw new ConfigurationError('inspect requires --load <path> --entity <id>');
  }
  const logger = new ConsoleLogger();
  const engine = SimulationEngine.loadFrom(values.load, storage, logger);
  const reader = toWorldStateReader(engine.getWorld());
  const snapshot = inspectEntity(reader, asEntityId(parseInt(values.entity, 10)));
  console.log(JSON.stringify(snapshot ?? { error: 'entity not found' }, null, 2));
}

function statsCommand(argv: string[]): void {
  const { values } = parseArgs({ args: argv, options: { load: { type: 'string' } } });
  if (!values.load) {
    throw new ConfigurationError('stats requires --load <path>');
  }
  const logger = new ConsoleLogger();
  const engine = SimulationEngine.loadFrom(values.load, storage, logger);
  const reader = toWorldStateReader(engine.getWorld());
  const stats = computeStatistics(reader, 100);
  console.log(JSON.stringify(stats, null, 2));
}

function eventsCommand(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { load: { type: 'string' }, last: { type: 'string' }, type: { type: 'string' } },
  });
  if (!values.load) {
    throw new ConfigurationError('events requires --load <path>');
  }
  const logger = new ConsoleLogger();
  const engine = SimulationEngine.loadFrom(values.load, storage, logger);
  const reader = toWorldStateReader(engine.getWorld());
  const events = queryEventHistory(reader, {
    last: values.last ? parseInt(values.last, 10) : undefined,
    type: values.type as SimEventType | undefined,
  });
  console.log(JSON.stringify(events, null, 2));
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  try {
    switch (command) {
      case 'run':
        runCommand(rest);
        break;
      case 'inspect':
        inspectCommand(rest);
        break;
      case 'stats':
        statsCommand(rest);
        break;
      case 'events':
        eventsCommand(rest);
        break;
      default:
        console.error('Usage: sim <run|inspect|stats|events> [options]');
        process.exitCode = 1;
    }
  } catch (error) {
    if (
      error instanceof ConfigurationError ||
      error instanceof PersistenceError ||
      error instanceof ValidationError ||
      error instanceof SimulationError
    ) {
      console.error(`${error.name}: ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}

main();
