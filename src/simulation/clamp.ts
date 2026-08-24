// Needs sind auf [0,100] geklemmt (Subtask 2 §3, Subtask 3 §6).
export function clampNeed(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}
