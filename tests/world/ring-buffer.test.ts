import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../../src/world/RingBuffer.js';

describe('RingBuffer (Subtask 2 §4/§7/§14)', () => {
  it('behält die Einfügereihenfolge innerhalb der Kapazität', () => {
    const buffer = new RingBuffer<number>(5);
    [1, 2, 3].forEach((n) => buffer.push(n));
    expect(buffer.toArray()).toEqual([1, 2, 3]);
  });

  it('verdrängt die ältesten Einträge bei Überschreiten der Kapazität', () => {
    const buffer = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => buffer.push(n));
    expect(buffer.toArray()).toEqual([3, 4, 5]);
  });

  it('length spiegelt die tatsächliche Anzahl gehaltener Elemente', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    expect(buffer.length).toBe(1);
    [2, 3, 4].forEach((n) => buffer.push(n));
    expect(buffer.length).toBe(3);
  });

  it('fromArray baut einen RingBuffer aus einem bestehenden Array wieder auf', () => {
    const buffer = RingBuffer.fromArray([1, 2, 3], 5);
    expect(buffer.toArray()).toEqual([1, 2, 3]);
  });
});
