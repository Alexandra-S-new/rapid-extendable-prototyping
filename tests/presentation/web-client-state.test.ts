import { describe, it, expect } from 'vitest';
import {
  initialState,
  navigateTo,
  navigateBack,
  goHome,
  resetForNewWorld,
  applyLoadRevalidation,
  followPerson,
  unfollowPerson,
  applyFollowRevalidation,
  recordEventTypes,
  toggleEventTypeFilter,
  clearEventFilter,
  passesEventFilter,
  describeFollowChange,
} from '../../src/presentation/web-client/state.js';

// web-client/state.ts (Subtask 23 §19/§27/§34): reiner UI-Navigationszustand
// — enthält keine DOM-/Browser-API-Nutzung, daher unter der bestehenden
// Node-Testumgebung direkt testbar (im Unterschied zu render.ts/api.ts/
// main.ts, die echte DOM-/fetch-APIs benötigen und stattdessen über den
// Vite-Build sowie die manuelle Browser-Prüfung abgesichert werden, Subtask
// 23 Abschlussbericht §47.7/§47.8).

describe('Navigation (Welt -> Ort -> Person/Tier -> Beziehung -> andere Person)', () => {
  it('startet in der Weltübersicht ohne Historie', () => {
    const state = initialState();
    expect(state.view).toEqual({ kind: 'world' });
    expect(state.history).toEqual([]);
  });

  it('navigateTo legt den bisherigen View auf die Historie', () => {
    let state = initialState();
    state = navigateTo(state, { kind: 'location', id: 1 });
    state = navigateTo(state, { kind: 'person', id: 47 });

    expect(state.view).toEqual({ kind: 'person', id: 47 });
    expect(state.history).toEqual([{ kind: 'world' }, { kind: 'location', id: 1 }]);
  });

  it('navigateBack kehrt zum vorherigen View zurück (mindestens eine sinnvolle Zurück-Navigation)', () => {
    let state = initialState();
    state = navigateTo(state, { kind: 'location', id: 1 });
    state = navigateTo(state, { kind: 'person', id: 47 });

    state = navigateBack(state);
    expect(state.view).toEqual({ kind: 'location', id: 1 });

    state = navigateBack(state);
    expect(state.view).toEqual({ kind: 'world' });
  });

  it('navigateBack aus der Weltübersicht bleibt in der Weltübersicht (kein Kontextverlust ins Leere)', () => {
    const state = navigateBack(initialState());
    expect(state.view).toEqual({ kind: 'world' });
  });

  it('erneutes Navigieren zum bereits aktiven View verändert die Historie nicht', () => {
    let state = initialState();
    state = navigateTo(state, { kind: 'location', id: 1 });
    const before = state.history.length;
    state = navigateTo(state, { kind: 'location', id: 1 });
    expect(state.history.length).toBe(before);
  });
});

describe('applyLoadRevalidation (Subtask 23 §23 — kein stale UI state nach Load)', () => {
  it('setzt eine nicht mehr existierende Auswahl nach Load auf die Weltübersicht zurück', () => {
    const state = navigateTo(initialState(), { kind: 'person', id: 47 });
    const result = applyLoadRevalidation(state, false);
    expect(result.view).toEqual({ kind: 'world' });
  });

  it('behält eine weiterhin existierende Auswahl nach Load unverändert', () => {
    const state = navigateTo(initialState(), { kind: 'person', id: 47 });
    const result = applyLoadRevalidation(state, true);
    expect(result.view).toEqual({ kind: 'person', id: 47 });
  });

  it('betrifft die Weltübersicht selbst nicht (nichts zu revalidieren)', () => {
    const result = applyLoadRevalidation(initialState(), false);
    expect(result.view).toEqual({ kind: 'world' });
  });
});

describe('goHome (Subtask 24 §13 — "Zur Welt")', () => {
  it('springt direkt zur Weltübersicht, unabhängig von der Historientiefe', () => {
    let state = initialState();
    state = navigateTo(state, { kind: 'location', id: 1 });
    state = navigateTo(state, { kind: 'person', id: 47 });
    state = navigateTo(state, { kind: 'person', id: 2 });

    const result = goHome(state);

    expect(result.view).toEqual({ kind: 'world' });
    expect(result.history).toEqual([]);
  });

  it('lässt Event-Filter und Beobachtung unangetastet (Subtask 24 §12/§13 — unabhängige Zustände)', () => {
    let state = initialState();
    state = followPerson(state, 47);
    state = toggleEventTypeFilter(state, 'BirthEvent');
    state = navigateTo(state, { kind: 'person', id: 47 });

    const result = goHome(state);

    expect(result.followedPersonId).toBe(47);
    expect(result.eventFilter.has('BirthEvent')).toBe(true);
  });
});

describe('Beobachtung ("Follow") einer Person (Subtask 24 §9/§10)', () => {
  it('followPerson setzt die beobachtete Person, unfollowPerson entfernt sie wieder', () => {
    let state = initialState();
    state = followPerson(state, 4);
    expect(state.followedPersonId).toBe(4);

    state = unfollowPerson(state);
    expect(state.followedPersonId).toBeNull();
  });

  it('followPerson wechselt die Beobachtung, ohne Navigation/Filter zu beeinflussen', () => {
    let state = initialState();
    state = navigateTo(state, { kind: 'person', id: 1 });
    state = followPerson(state, 4);

    expect(state.view).toEqual({ kind: 'person', id: 1 });
    expect(state.followedPersonId).toBe(4);
  });

  it('applyFollowRevalidation entfernt eine nach Load nicht mehr existierende Beobachtung automatisch', () => {
    const state = followPerson(initialState(), 47);
    const result = applyFollowRevalidation(state, false);
    expect(result.followedPersonId).toBeNull();
  });

  it('applyFollowRevalidation lässt eine weiterhin existierende Beobachtung unverändert', () => {
    const state = followPerson(initialState(), 47);
    const result = applyFollowRevalidation(state, true);
    expect(result.followedPersonId).toBe(47);
  });

  it('applyFollowRevalidation ist ein No-Op, wenn ohnehin niemand beobachtet wird', () => {
    const result = applyFollowRevalidation(initialState(), false);
    expect(result.followedPersonId).toBeNull();
  });
});

describe('Event-Filter (Subtask 24 §7/§8)', () => {
  it('recordEventTypes akkumuliert dynamisch gesehene Eventtypen, ohne Duplikate', () => {
    let state = initialState();
    state = recordEventTypes(state, ['BirthEvent', 'TradeEvent']);
    state = recordEventTypes(state, ['TradeEvent', 'DeathEvent']);

    expect([...state.knownEventTypes].sort()).toEqual(['BirthEvent', 'DeathEvent', 'TradeEvent']);
  });

  it('ohne aktiven Filter lässt passesEventFilter jeden Typ durch', () => {
    expect(passesEventFilter(initialState(), 'BirthEvent')).toBe(true);
  });

  it('toggleEventTypeFilter schaltet einen Typ ein und wieder aus', () => {
    let state = initialState();
    state = toggleEventTypeFilter(state, 'BirthEvent');
    expect(passesEventFilter(state, 'BirthEvent')).toBe(true);
    expect(passesEventFilter(state, 'DeathEvent')).toBe(false);

    state = toggleEventTypeFilter(state, 'BirthEvent');
    expect(passesEventFilter(state, 'DeathEvent')).toBe(true);
  });

  it('clearEventFilter setzt auf "alle Typen sichtbar" zurück (Auftrag §8: "zurücksetzbar")', () => {
    let state = initialState();
    state = toggleEventTypeFilter(state, 'BirthEvent');
    state = toggleEventTypeFilter(state, 'DeathEvent');

    state = clearEventFilter(state);

    expect(state.eventFilter.size).toBe(0);
    expect(passesEventFilter(state, 'TradeEvent')).toBe(true);
  });

  it('bleibt beim Wechsel der Navigationsansicht erhalten (Auftrag §8)', () => {
    let state = initialState();
    state = toggleEventTypeFilter(state, 'BirthEvent');
    state = navigateTo(state, { kind: 'location', id: 1 });
    state = navigateBack(state);

    expect(passesEventFilter(state, 'DeathEvent')).toBe(false);
  });
});

describe('resetForNewWorld (Subtask 25 §9.4 — Neustart)', () => {
  it('verwirft Auswahl, Historie und Beobachtung bedingungslos, unabhängig von Existenz', () => {
    let state = initialState();
    state = navigateTo(state, { kind: 'location', id: 1 });
    state = navigateTo(state, { kind: 'person', id: 47 });
    state = followPerson(state, 47);

    const result = resetForNewWorld(state);

    expect(result.view).toEqual({ kind: 'world' });
    expect(result.history).toEqual([]);
    expect(result.followedPersonId).toBeNull();
  });

  it('lässt Event-Filter und bekannte Eventtypen unangetastet (reine UI-Präferenz, unabhängig von der konkreten Welt)', () => {
    let state = initialState();
    state = recordEventTypes(state, ['BirthEvent', 'TradeEvent']);
    state = toggleEventTypeFilter(state, 'BirthEvent');

    const result = resetForNewWorld(state);

    expect(result.eventFilter.has('BirthEvent')).toBe(true);
    expect([...result.knownEventTypes].sort()).toEqual(['BirthEvent', 'TradeEvent']);
  });

  it('verwirft auch eine Auswahl, deren ID nach dem Neustart zufällig wieder existieren könnte (kein bloßer Existenz-Check)', () => {
    // Nach einem Neustart beginnen Entity-IDs wieder bei 1 — ID 47 könnte in
    // der neuen Welt bereits eine völlig andere, neue Entity bezeichnen.
    // resetForNewWorld darf sich deshalb NICHT wie applyLoadRevalidation
    // verhalten (die eine weiterhin "existierende" ID beibehalten würde).
    const state = followPerson(navigateTo(initialState(), { kind: 'person', id: 47 }), 47);
    const result = resetForNewWorld(state);
    expect(result.view).toEqual({ kind: 'world' });
    expect(result.followedPersonId).toBeNull();
  });
});

describe('describeFollowChange (Subtask 25 §8 — kompakte zeitliche Entwicklung)', () => {
  it('liefert null ohne vorherige Momentaufnahme (erste Beobachtung)', () => {
    expect(describeFollowChange(null, { locationId: 1, activityLabel: 'Idle' }, 5)).toBeNull();
  });

  it('liefert null, wenn sich weder Ort noch Aktivität geändert haben', () => {
    const snap = { locationId: 1, activityLabel: 'Idle' };
    expect(describeFollowChange(snap, { ...snap }, 5)).toBeNull();
  });

  it('beschreibt einen Ortswechsel', () => {
    const result = describeFollowChange({ locationId: 1, activityLabel: 'Idle' }, { locationId: 2, activityLabel: 'Idle' }, 10);
    expect(result).toContain('Tick 10');
    expect(result).toContain('Ort → #2');
  });

  it('beschreibt einen Aktivitätswechsel', () => {
    const result = describeFollowChange({ locationId: 1, activityLabel: 'Idle' }, { locationId: 1, activityLabel: 'Work (seit 1 Ticks)' }, 12);
    expect(result).toContain('Aktivität → Work (seit 1 Ticks)');
  });

  it('beschreibt beide Änderungen gemeinsam, wenn beide gleichzeitig eintreten', () => {
    const result = describeFollowChange({ locationId: 1, activityLabel: 'Idle' }, { locationId: 2, activityLabel: 'Sleep (seit 1 Ticks)' }, 20);
    expect(result).toContain('Ort → #2');
    expect(result).toContain('Aktivität → Sleep (seit 1 Ticks)');
  });
});
