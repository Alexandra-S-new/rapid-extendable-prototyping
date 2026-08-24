// Fehlerarchitektur (Subtask 2 §15, Subtask 3 §15): bewusst vier Klassen,
// keine künstliche Tiefe. Domain-Modul, da alle anderen Schichten
// (config/, persistence/, application/, simulation/) davon abhängen können.

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export type ValidationSource = 'config' | 'savegame';

export class ValidationError extends Error {
  readonly source: ValidationSource;
  readonly issues: readonly string[];

  constructor(source: ValidationSource, issues: readonly string[]) {
    super(`Validation failed (source=${source}): ${issues.join('; ')}`);
    this.name = 'ValidationError';
    this.source = source;
    this.issues = issues;
  }
}

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export interface SimulationErrorContext {
  readonly seed: number;
  readonly tick: number;
  readonly entityIds?: readonly number[];
}

export class SimulationError extends Error {
  readonly context: SimulationErrorContext;

  constructor(message: string, context: SimulationErrorContext) {
    super(message);
    this.name = 'SimulationError';
    this.context = context;
  }
}
