import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SimulationEngine } from '../../application/SimulationEngine.js';
import { SimulationController } from '../../application/SimulationController.js';
import { loadConfig, applyCliOverrides } from '../../application/loadConfig.js';
import { FileRawStorage } from '../../persistence/FileRawStorage.js';
import { ConsoleLogger } from '../../observability/Logger.js';
import { createWebServer } from './server.js';

// presentation/web/index.ts (Subtask 23 §40/§41): eigenständiger,
// zusätzlicher Presentation-Einstiegspunkt — Bootstrap-Struktur bewusst
// analog presentation/interactive.ts (argv-Parsing, Config laden,
// SimulationEngine.create/loadFrom, ConsoleLogger, FileRawStorage,
// SimulationController), aber ohne dessen Dateien zu verändern. Ab hier
// arbeitet ausschließlich der neue Web-Server über SimulationController/
// WorldObserver — kein direkter WorldState-Zugriff.

const DEFAULT_PORT = 4173;
const DEFAULT_HOST = '127.0.0.1';

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      seed: { type: 'string' },
      config: { type: 'string' },
      load: { type: 'string' },
      humans: { type: 'string' },
      animals: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
      'static-dir': { type: 'string' },
    },
  });

  const logger = new ConsoleLogger('error');
  const storage = new FileRawStorage();

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

  const controller = new SimulationController(engine, logger);
  // initialConfig (Subtask 25 §9.2/§9.3): dieselbe SimulationConfig, aus der
  // die allererste Engine erzeugt wurde — egal ob per --config/--seed neu
  // gebaut oder per --load aus einem Save entnommen (SimulationEngine.getConfig()
  // ist bereits eine bestehende, rein lesende Methode). Grundlage für den
  // neuen Restart-Endpunkt; kein weiterer Zustand nötig.
  const initialConfig = engine.getConfig();

  const port = values.port ? parseInt(values.port, 10) : DEFAULT_PORT;
  const host = values.host ?? DEFAULT_HOST;
  const staticDir = values['static-dir']
    ? resolve(values['static-dir'])
    : resolve(dirname(fileURLToPath(import.meta.url)), '../../../dist/web-client');

  const server = createWebServer({ controller, storage, logger, staticDir, initialConfig });

  server.listen(port, host, () => {
    // eslint-disable-next-line no-console -- bewusster Presentation-seitiger Start-Hinweis, kein Logger-Fachereignis
    console.log(`Living World — Web-Anwendung läuft auf http://${host}:${port}`);
  });

  process.on('SIGINT', () => {
    controller.pause();
    server.close(() => process.exit(0));
  });
}

main();
