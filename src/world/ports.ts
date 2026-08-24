// Domain-Ports (Subtask 3 §7.5/§8, Subtask 3.10): von der Domäne benutzt,
// aber nicht implementiert. Konkrete Adapter liegen in random/ bzw.
// observability/ bzw. persistence/ (Infrastructure).

export interface RandomSource {
  nextFloat(): number; // [0, 1)
  nextInt(maxExclusive: number): number;
  getState(): number; // für Persistenz (Subtask 3.12)
}

export interface LogContext {
  readonly tick: number;
  readonly system?: string;
  readonly entityId?: number;
}

export interface Logger {
  debug(message: string, context: LogContext): void;
  info(message: string, context: LogContext): void;
  warn(message: string, context: LogContext): void;
  error(message: string, context: LogContext): void;
}

export interface RawStorage {
  read(path: string): string;
  write(path: string, content: string): void;
}
