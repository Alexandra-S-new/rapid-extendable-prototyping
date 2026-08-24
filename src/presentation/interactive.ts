import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { SimulationEngine } from '../application/SimulationEngine.js';
import { SimulationController } from '../application/SimulationController.js';
import { loadConfig, applyCliOverrides } from '../application/loadConfig.js';
import { FileRawStorage } from '../persistence/FileRawStorage.js';
import { ConsoleLogger } from '../observability/Logger.js';
import { asEntityId, asLocationId } from '../domain/value-objects/ids.js';
import { ConfigurationError, PersistenceError, ValidationError, SimulationError } from '../domain/errors.js';
import {
  formatMenu,
  parseMenuChoice,
  formatStatus,
  formatWorldOverview,
  formatPerson,
  formatAnimal,
  formatLocation,
  formatEvents,
  type MenuCommand,
} from './interactiveFormat.js';

// presentation/interactive.ts (Subtask 20, gemäß Subtask 19 §32.9/§32.17):
// eigenständiger, klar abgegrenzter interaktiver Einstiegspunkt — bewusst
// getrennt von presentation/cli.ts (dort weiterhin dokumentiert als
// "Batch-Prozess, kein interaktives Pause/Resume", 02 §18). Arbeitet
// AUSSCHLIESSLICH über SimulationController/WorldObserver — kein direkter
// Zugriff auf WorldState, keine direkte Domain-Mutation. Reine
// Präsentationslogik (argv-Parsing, Terminal-I/O, Textformatierung); die
// eigentliche Formatierung ist in interactiveFormat.ts ausgelagert und dort
// unabhängig testbar.

const storage = new FileRawStorage();

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      seed: { type: 'string' },
      config: { type: 'string' },
      load: { type: 'string' },
      humans: { type: 'string' },
      animals: { type: 'string' },
    },
  });

  // Niedrige Log-Schwelle: bei laufendem Scheduler feuern Ticks im
  // Hintergrund weiter — Info/Debug-Logs der Systeme würden das
  // interaktive Menü zumüllen. Reine Presentation-Entscheidung, ändert
  // nichts an der Simulationslogik (Logger-Port ist bereits konfigurierbar).
  const logger = new ConsoleLogger('error');

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
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('Living World Simulation — interaktiver Modus');
  console.log(formatStatus(controller.getStatus()));

  let running = true;
  while (running) {
    console.log('\n' + formatMenu());
    const answer = await rl.question('> ');
    const command = parseMenuChoice(answer);
    if (!command) {
      console.log('Ungültige Auswahl.');
      continue;
    }

    try {
      running = await handleCommand(command, controller, rl);
    } catch (error) {
      if (
        error instanceof ConfigurationError ||
        error instanceof PersistenceError ||
        error instanceof ValidationError ||
        error instanceof SimulationError ||
        error instanceof RangeError
      ) {
        console.error(`${error.name ?? 'Error'}: ${error.message}`);
      } else {
        rl.close();
        throw error;
      }
    }
  }

  rl.close();
}

async function handleCommand(
  command: MenuCommand,
  controller: SimulationController,
  rl: ReturnType<typeof createInterface>,
): Promise<boolean> {
  switch (command.kind) {
    case 'Start':
      controller.start();
      console.log(formatStatus(controller.getStatus()));
      return true;
    case 'Pause':
      controller.pause();
      console.log(formatStatus(controller.getStatus()));
      return true;
    case 'Resume':
      controller.resume();
      console.log(formatStatus(controller.getStatus()));
      return true;
    case 'Step': {
      const ticksInput = await rl.question('Wie viele Ticks? [1] ');
      const ticks = ticksInput.trim() === '' ? 1 : Number.parseInt(ticksInput, 10);
      controller.step(Number.isInteger(ticks) && ticks > 0 ? ticks : 1);
      console.log(formatStatus(controller.getStatus()));
      return true;
    }
    case 'SetSpeed': {
      const speedInput = await rl.question('Neue Geschwindigkeit (Ticks/Sekunde)? ');
      const speed = Number.parseFloat(speedInput);
      controller.setSpeed(speed);
      console.log(formatStatus(controller.getStatus()));
      return true;
    }
    case 'ShowWorld':
      console.log(formatWorldOverview(controller.getObserver().getWorldSnapshot()));
      return true;
    case 'InspectPerson': {
      const idInput = await rl.question('Entity-ID der Person? ');
      const id = asEntityId(Number.parseInt(idInput, 10));
      console.log(formatPerson(controller.getObserver().getPersonObservation(id)));
      return true;
    }
    case 'InspectAnimal': {
      const idInput = await rl.question('Entity-ID des Tiers? ');
      const id = asEntityId(Number.parseInt(idInput, 10));
      console.log(formatAnimal(controller.getObserver().getAnimalObservation(id)));
      return true;
    }
    case 'InspectLocation': {
      const idInput = await rl.question('Location-ID? ');
      const id = asLocationId(Number.parseInt(idInput, 10));
      console.log(formatLocation(controller.getObserver().getLocationObservation(id)));
      return true;
    }
    case 'ShowEvents': {
      const lastInput = await rl.question('Wie viele letzte Ereignisse? [10] ');
      const parsedLast = Number.parseInt(lastInput, 10);
      const last = Number.isInteger(parsedLast) && parsedLast > 0 ? parsedLast : 10;
      console.log(formatEvents(controller.getObserver().getRecentEvents({ last })));
      return true;
    }
    case 'Save': {
      const path = await rl.question('Speicherpfad? ');
      controller.save(path, storage, new Date().toISOString());
      console.log(`Gespeichert nach ${path}`);
      return true;
    }
    case 'Load': {
      const path = await rl.question('Ladepfad? ');
      controller.load(path, storage);
      console.log(formatStatus(controller.getStatus()));
      return true;
    }
    case 'Exit':
      controller.pause();
      return false;
  }
}

main();
