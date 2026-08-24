import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TickScheduler } from '../../src/application/TickScheduler.js';

// TickScheduler (Subtask 20, gemäß Subtask 19 §32.10/§32.13): reine
// Wall-Clock-Kadenzsteuerung, kein Bezug zur Simulationslogik selbst.
// Getestet mit vitest-Fake-Timern statt echter Wartezeit.

describe('TickScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ruft den callback im gesetzten Intervall auf', () => {
    const scheduler = new TickScheduler(100);
    const callback = vi.fn();
    scheduler.start(callback);

    vi.advanceTimersByTime(350);

    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('stop() beendet weitere Aufrufe', () => {
    const scheduler = new TickScheduler(100);
    const callback = vi.fn();
    scheduler.start(callback);
    vi.advanceTimersByTime(150);
    scheduler.stop();
    vi.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('isRunning() spiegelt den Start-/Stop-Zustand wider', () => {
    const scheduler = new TickScheduler(100);
    expect(scheduler.isRunning()).toBe(false);
    scheduler.start(() => {});
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('setIntervalMs() ändert die Kadenz eines laufenden Schedulers', () => {
    const scheduler = new TickScheduler(100);
    const callback = vi.fn();
    scheduler.start(callback);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.setIntervalMs(50);
    vi.advanceTimersByTime(150);
    // Nach der Umstellung auf 50ms: 3 weitere Aufrufe in 150ms.
    expect(callback).toHaveBeenCalledTimes(4);
  });

  it('setIntervalMs() vor start() wirkt nur auf die künftige Kadenz, ohne selbst zu feuern', () => {
    const scheduler = new TickScheduler(100);
    scheduler.setIntervalMs(10);
    expect(scheduler.isRunning()).toBe(false);

    const callback = vi.fn();
    scheduler.start(callback);
    vi.advanceTimersByTime(35);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('konstruktor/setIntervalMs lehnen nicht-positive oder nicht-endliche Intervalle ab', () => {
    expect(() => new TickScheduler(0)).toThrow(RangeError);
    expect(() => new TickScheduler(-5)).toThrow(RangeError);
    expect(() => new TickScheduler(Number.POSITIVE_INFINITY)).toThrow(RangeError);

    const scheduler = new TickScheduler(100);
    expect(() => scheduler.setIntervalMs(0)).toThrow(RangeError);
  });

  it('ein erneuter start() nach stop() nimmt den Betrieb korrekt wieder auf', () => {
    const scheduler = new TickScheduler(100);
    const callback = vi.fn();
    scheduler.start(callback);
    vi.advanceTimersByTime(100);
    scheduler.stop();
    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.start(callback);
    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(3);
  });
});
