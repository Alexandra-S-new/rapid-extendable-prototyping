import type { Logger, LogContext } from '../world/ports.js';

// ConsoleLogger (Subtask 2 §14, Subtask 3 §8): Infrastructure-Adapter,
// implementiert den Logger-Port. Strukturiert, leveled, getaggt mit
// System/Tick — kein direkter console-Aufruf in der Fachlogik.
const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

export class ConsoleLogger implements Logger {
  constructor(private readonly minLevel: Level = 'info') {}

  debug(message: string, context: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context: LogContext): void {
    this.log('error', message, context);
  }

  private log(level: Level, message: string, context: LogContext): void {
    if (LEVELS.indexOf(level) < LEVELS.indexOf(this.minLevel)) return;
    const tag = `[tick=${context.tick}${context.system ? ` system=${context.system}` : ''}${context.entityId !== undefined ? ` entity=${context.entityId}` : ''}]`;
    const line = `${level.toUpperCase()} ${tag} ${message}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}
