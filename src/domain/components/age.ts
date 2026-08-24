// Age (Subtask 2 §3): Lebensalter in Ticks. LifeStage wird beim Lesen
// abgeleitet, nicht gespeichert (nichts rein Abgeleitetes wird persistiert).
//
// ticksAtZeroHunger (Subtask 4, notwendige mechanische Ergänzung): 03 §10
// verlangt Sterblichkeit "Hunger nahe 0 über N [config.needs.
// starvationDeathThresholdTicks] Ticks" — das ist genuin historischer
// Zustand (nicht aus einem Snapshot ableitbar) und daher keine verbotene
// "rein abgeleitete" Zwischenspeicherung; ohne dieses Feld wäre die
// dokumentierte Regel nicht implementierbar. Kein neues Component, nur ein
// zusätzliches Feld auf dem bereits generischen Age.
export interface Age {
  ticksAlive: number;
  ticksAtZeroHunger: number;
}

export type LifeStage = 'child' | 'adult';

export function deriveLifeStage(age: Age, minAdultAgeTicks: number): LifeStage {
  return age.ticksAlive >= minAdultAgeTicks ? 'adult' : 'child';
}
