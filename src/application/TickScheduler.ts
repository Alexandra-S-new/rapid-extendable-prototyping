// TickScheduler (Subtask 20, gemäß Subtask 19 §32.10/§32.13): reale
// Wall-Clock-Zeit entscheidet ausschließlich, WANN ein Tick angestoßen wird
// — niemals WAS darin passiert. Lebt bewusst außerhalb von domain/, world/
// und simulation/ (Application-Schicht). Nutzt ausschließlich die
// Standard-Timer-Funktionen der Laufzeitumgebung (setInterval/clearInterval)
// — keine neue Abhängigkeit.
export class TickScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private callback: (() => void) | undefined;
  private intervalMs: number;
  // Wiedereintritts-Schutz: Node.js garantiert zwar Lauf-bis-Abschluss für
  // den synchronen callback (kein echtes Überlappungsrisiko), dieser Flag
  // stellt zusätzlich sicher, dass niemals zwei sich überlappende Ticks
  // angestoßen werden (Subtask 19 §32.13 Punkt 3/4: niemals einen
  // laufenden Tick unterbrechen).
  private firing = false;

  constructor(intervalMs: number) {
    assertPositiveFinite(intervalMs);
    this.intervalMs = intervalMs;
  }

  start(callback: () => void): void {
    this.callback = callback;
    this.restartTimer();
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.callback = undefined;
  }

  isRunning(): boolean {
    return this.timer !== undefined;
  }

  setIntervalMs(intervalMs: number): void {
    assertPositiveFinite(intervalMs);
    this.intervalMs = intervalMs;
    if (this.timer !== undefined) {
      this.restartTimer();
    }
  }

  private restartTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => {
      if (this.firing) return;
      this.firing = true;
      try {
        this.callback?.();
      } finally {
        this.firing = false;
      }
    }, this.intervalMs);
  }
}

function assertPositiveFinite(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('TickScheduler intervalMs must be a positive, finite number');
  }
}
