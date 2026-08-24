import { describe, it, expect } from 'vitest';
import {
  MENU,
  parseMenuChoice,
  formatMenu,
  formatStatus,
  formatWorldOverview,
  formatPerson,
  formatAnimal,
  formatLocation,
  formatEvents,
  describeActivity,
  describeEvent,
} from '../../src/presentation/interactiveFormat.js';
import { asEntityId, asLocationId, asBuildingId, asActionId } from '../../src/domain/value-objects/ids.js';
import type { WorldSnapshot, PersonObservation, AnimalObservation, LocationObservation } from '../../src/observability/WorldObserver.js';

// interactiveFormat.ts (Subtask 20): reine Parsing-/Formatierungsfunktionen
// des interaktiven Einstiegspunkts — unabhängig vom Terminal testbar.

describe('parseMenuChoice / formatMenu', () => {
  it('formatMenu() listet alle 13 geforderten Menüpunkte in der vorgegebenen Reihenfolge', () => {
    const expectedLabels = [
      'Start',
      'Pause',
      'Resume',
      'Step',
      'Geschwindigkeit ändern',
      'Weltübersicht anzeigen',
      'Person untersuchen',
      'Tier untersuchen',
      'Ort untersuchen',
      'Ereignisse anzeigen',
      'Save',
      'Load',
      'Exit',
    ];
    expect(MENU.map((m) => m.label)).toEqual(expectedLabels);
    expect(formatMenu()).toContain('1) Start');
    expect(formatMenu()).toContain('13) Exit');
  });

  it('parseMenuChoice() ordnet eine gültige Zahl dem richtigen Command zu', () => {
    expect(parseMenuChoice('1')).toEqual({ kind: 'Start' });
    expect(parseMenuChoice('13')).toEqual({ kind: 'Exit' });
    expect(parseMenuChoice('  7 ')).toEqual({ kind: 'InspectPerson' });
  });

  it('parseMenuChoice() liefert undefined für ungültige Eingaben', () => {
    expect(parseMenuChoice('0')).toBeUndefined();
    expect(parseMenuChoice('14')).toBeUndefined();
    expect(parseMenuChoice('abc')).toBeUndefined();
    expect(parseMenuChoice('')).toBeUndefined();
    expect(parseMenuChoice('1.5')).toBeUndefined();
  });
});

describe('formatStatus', () => {
  it('formatiert Zustand, Tick und Geschwindigkeit', () => {
    const text = formatStatus({ state: 'running', currentTick: 42, ticksPerSecond: 5 });
    expect(text).toContain('running');
    expect(text).toContain('42');
    expect(text).toContain('5');
  });
});

describe('describeActivity', () => {
  it('beschreibt Idle/Traveling/Performing unterschiedlich', () => {
    expect(describeActivity({ kind: 'Idle' })).toBe('Idle');
    expect(describeActivity({ kind: 'Traveling', destination: asLocationId(2) })).toContain('#2');
    expect(describeActivity({ kind: 'Performing', actionId: asActionId('Eat'), ticksInAction: 3 })).toContain('Eat');
  });
});

describe('describeEvent / formatEvents', () => {
  it('beschreibt jeden der acht bestehenden SimEvent-Typen ohne neue Eventarten zu erfinden', () => {
    expect(describeEvent({ type: 'BirthEvent', sequence: 0, tick: 1, entityId: asEntityId(3), parentIds: [asEntityId(1), asEntityId(2)] })).toContain('Geburt');
    expect(describeEvent({ type: 'DeathEvent', sequence: 0, tick: 1, entityId: asEntityId(3), cause: 'old_age' })).toContain('Tod');
    expect(
      describeEvent({ type: 'TradeEvent', sequence: 0, tick: 1, buyer: asEntityId(1), seller: asEntityId(2), resource: 'Food', amount: 5, price: 1 }),
    ).toContain('Handel');
    expect(describeEvent({ type: 'HarvestEvent', sequence: 0, tick: 1, buildingId: asBuildingId(1), resource: 'Wood', amount: 5 })).toContain('Ernte');
    expect(
      describeEvent({ type: 'MovementEvent', sequence: 0, tick: 1, entityId: asEntityId(1), fromLocation: asLocationId(1), toLocation: asLocationId(2) }),
    ).toContain('Bewegung');
    expect(describeEvent({ type: 'SeasonChangedEvent', sequence: 0, tick: 1, season: 'Summer' })).toContain('Summer');
    expect(describeEvent({ type: 'WeatherChangedEvent', sequence: 0, tick: 1, weather: 'Rain' })).toContain('Rain');
    expect(
      describeEvent({ type: 'BuildingConditionChangedEvent', sequence: 0, tick: 1, buildingId: asBuildingId(1), condition: 10, band: 'critical' }),
    ).toContain('critical');
  });

  it('formatEvents() zeigt einen Platzhalter für eine leere Liste', () => {
    expect(formatEvents([])).toBe('(keine Ereignisse)');
  });
});

describe('formatPerson / formatAnimal / formatLocation', () => {
  const basePerson: PersonObservation = {
    id: asEntityId(1),
    kind: 'person',
    displayName: 'Alex',
    role: 'Farmer',
    ageTicks: 30,
    lifeStage: 'adult',
    locationId: asLocationId(1),
    needs: { hunger: 50.4, energy: 60.1, social: 70.9 },
    currentActivity: { kind: 'Idle' },
    partnerId: asEntityId(2),
    friendIds: [asEntityId(3)],
    parentIds: [],
    childIds: [],
  };

  it('formatiert eine bekannte Person mit allen Kernfeldern', () => {
    const text = formatPerson(basePerson);
    expect(text).toContain('Alex');
    expect(text).toContain('Farmer');
    expect(text).toContain('adult');
    expect(text).toContain('#2'); // partnerId
    expect(text).toContain('3'); // friendIds
  });

  it('formatiert eine unbekannte Person als expliziten Hinweis, nicht als Absturz', () => {
    expect(formatPerson(undefined)).toContain('Unbekannte');
  });

  it('formatiert ein bekanntes Tier', () => {
    const animal: AnimalObservation = {
      id: asEntityId(9),
      kind: 'animal',
      species: 'Rabbit',
      ageTicks: 12,
      lifeStage: 'child',
      locationId: asLocationId(1),
      needs: { hunger: 20, energy: 30 },
      currentActivity: { kind: 'Idle' },
      parentIds: [],
      childIds: [],
    };
    expect(formatAnimal(animal)).toContain('Rabbit');
    expect(formatAnimal(undefined)).toContain('Unbekanntes');
  });

  it('formatiert einen bekannten Ort inkl. Gebäude', () => {
    const location: LocationObservation = {
      id: asLocationId(1),
      name: 'Dorf',
      personCount: 3,
      animalCount: 1,
      buildings: [{ id: asBuildingId(1), kind: 'Field', condition: 12.3 }],
    };
    const text = formatLocation(location);
    expect(text).toContain('Dorf');
    expect(text).toContain('Field');
    expect(formatLocation(undefined)).toContain('Unbekannter Ort');
  });
});

describe('formatWorldOverview', () => {
  it('enthält Tick, Orte mit Population und jüngste Ereignisse', () => {
    const snapshot: WorldSnapshot = {
      tick: 10,
      season: 'Spring',
      weather: 'Clear',
      locations: [{ id: asLocationId(1), name: 'Dorf', personCount: 2, animalCount: 1, buildings: [] }],
      people: [],
      animals: [],
      recentEvents: [{ type: 'SeasonChangedEvent', sequence: 0, tick: 5, season: 'Summer' }],
    };
    const text = formatWorldOverview(snapshot);
    expect(text).toContain('Tick 10');
    expect(text).toContain('Dorf');
    expect(text).toContain('2 Personen');
    expect(text).toContain('Summer');
  });

  it('zeigt einen Platzhalter, wenn keine jüngsten Ereignisse vorliegen', () => {
    const snapshot: WorldSnapshot = {
      tick: 0,
      season: 'Spring',
      weather: 'Clear',
      locations: [],
      people: [],
      animals: [],
      recentEvents: [],
    };
    expect(formatWorldOverview(snapshot)).toContain('(keine Ereignisse)');
  });
});
