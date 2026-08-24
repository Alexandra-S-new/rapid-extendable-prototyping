// Schmale Lesesicht auf RingBuffer (für WorldStateReader) — RingBuffer<T>
// erfüllt dieses Interface strukturell bereits, ohne es explizit zu
// implementieren.
export interface ReadonlyRingBuffer<T> {
  readonly length: number;
  toArray(): T[];
}

// Begrenzter Ringpuffer für Event-History (Subtask 2 §4/§7/§14).
// Verdrängt älteste Einträge bei Überschreiten der Kapazität; behält die
// Einfügereihenfolge (= Emissionsreihenfolge) bei.
export class RingBuffer<T> {
  private readonly items: T[] = [];
  private start = 0;

  constructor(readonly capacity: number) {
    if (capacity <= 0) {
      throw new RangeError('RingBuffer capacity must be positive');
    }
  }

  push(item: T): void {
    if (this.items.length < this.capacity) {
      this.items.push(item);
      return;
    }
    this.items[this.start] = item;
    this.start = (this.start + 1) % this.capacity;
  }

  get length(): number {
    return this.items.length;
  }

  // Aufsteigend in Einfügereihenfolge (älteste zuerst).
  toArray(): T[] {
    if (this.items.length < this.capacity) {
      return [...this.items];
    }
    return [...this.items.slice(this.start), ...this.items.slice(0, this.start)];
  }

  static fromArray<T>(items: readonly T[], capacity: number): RingBuffer<T> {
    const buffer = new RingBuffer<T>(capacity);
    for (const item of items) {
      buffer.push(item);
    }
    return buffer;
  }
}
