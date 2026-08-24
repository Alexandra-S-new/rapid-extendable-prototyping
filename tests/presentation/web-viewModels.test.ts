import { describe, it, expect } from 'vitest';
import {
  toActivityViewModel,
  toEventViewModel,
  toEventViewModels,
  toWorldViewModel,
  toLocationDetailViewModel,
  toPersonDetailViewModel,
  toAnimalDetailViewModel,
} from '../../src/presentation/web/viewModels.js';
import { asEntityId, asLocationId, asBuildingId, asActionId } from '../../src/domain/value-objects/ids.js';
import type { WorldSnapshot, PersonObservation, AnimalObservation, LocationObservation, LocationGraphNode } from '../../src/observability/WorldObserver.js';
import type { ControllerStatus } from '../../src/application/SimulationController.js';

// web/viewModels.ts (Subtask 23 §26/§34): reine Presentation-Aufbereitung —
// unabhängig von HTTP-Server/WorldObserver testbar.

describe('toActivityViewModel', () => {
  it('beschreibt Idle/Traveling/Performing unterschiedlich', () => {
    expect(toActivityViewModel({ kind: 'Idle' }).label).toBe('Idle');
    expect(toActivityViewModel({ kind: 'Traveling', destination: asLocationId(2) }).label).toContain('#2');
    expect(toActivityViewModel({ kind: 'Performing', actionId: asActionId('Eat'), ticksInAction: 3 }).label).toContain('Eat');
  });
});

describe('toEventViewModel — Event → Person/Ort-Navigation', () => {
  it('BirthEvent verlinkt Entity und Eltern (Event → Person)', () => {
    const vm = toEventViewModel({ type: 'BirthEvent', sequence: 0, tick: 1, entityId: asEntityId(3), parentIds: [asEntityId(1), asEntityId(2)] });
    expect(vm.summary).toContain('Geburt');
    expect(vm.links).toEqual([
      { kind: 'person', id: 3, label: 'Person #3' },
      { kind: 'person', id: 1, label: 'Person #1' },
      { kind: 'person', id: 2, label: 'Person #2' },
    ]);
  });

  it('DeathEvent verlinkt bewusst nicht (Ziel ist nicht mehr beobachtbar)', () => {
    const vm = toEventViewModel({ type: 'DeathEvent', sequence: 0, tick: 1, entityId: asEntityId(3), cause: 'starvation' });
    expect(vm.summary).toContain('Tod');
    expect(vm.links).toEqual([]);
  });

  it('TradeEvent verlinkt Käufer und Verkäufer', () => {
    const vm = toEventViewModel({ type: 'TradeEvent', sequence: 0, tick: 1, buyer: asEntityId(1), seller: asEntityId(2), resource: 'Food', amount: 5, price: 3 });
    expect(vm.links.map((l) => l.id)).toEqual([1, 2]);
    expect(vm.links.every((l) => l.kind === 'person')).toBe(true);
  });

  it('HarvestEvent verlinkt bewusst nicht (keine Ortszuordnung unmittelbar ableitbar)', () => {
    const vm = toEventViewModel({ type: 'HarvestEvent', sequence: 0, tick: 1, buildingId: asBuildingId(1), resource: 'Wood', amount: 5 });
    expect(vm.links).toEqual([]);
  });

  it('MovementEvent verlinkt Person und beide Orte (Event → Ort)', () => {
    const vm = toEventViewModel({ type: 'MovementEvent', sequence: 0, tick: 1, entityId: asEntityId(1), fromLocation: asLocationId(1), toLocation: asLocationId(2) });
    expect(vm.links).toEqual([
      { kind: 'person', id: 1, label: 'Person #1' },
      { kind: 'location', id: 1, label: 'Ort #1' },
      { kind: 'location', id: 2, label: 'Ort #2' },
    ]);
  });

  it('SeasonChangedEvent/WeatherChangedEvent/BuildingConditionChangedEvent verlinken nicht', () => {
    expect(toEventViewModel({ type: 'SeasonChangedEvent', sequence: 0, tick: 1, season: 'Summer' }).links).toEqual([]);
    expect(toEventViewModel({ type: 'WeatherChangedEvent', sequence: 0, tick: 1, weather: 'Rain' }).links).toEqual([]);
    expect(
      toEventViewModel({ type: 'BuildingConditionChangedEvent', sequence: 0, tick: 1, buildingId: asBuildingId(1), condition: 10, band: 'critical' }).links,
    ).toEqual([]);
  });
});

describe('toEventViewModels', () => {
  it('sortiert neueste zuerst (Subtask 23 §17)', () => {
    const events = [
      { type: 'SeasonChangedEvent' as const, sequence: 0, tick: 1, season: 'Summer' as const },
      { type: 'WeatherChangedEvent' as const, sequence: 1, tick: 2, weather: 'Rain' as const },
    ];
    const vms = toEventViewModels(events);
    expect(vms.map((v) => v.tick)).toEqual([2, 1]);
  });
});

describe('toWorldViewModel', () => {
  it('projiziert Zählungen/Graph-Kanten, ohne volle Personen-/Tierlisten (keine Datenwand)', () => {
    const snapshot: WorldSnapshot = {
      tick: 10,
      season: 'Spring',
      weather: 'Clear',
      locations: [{ id: asLocationId(1), name: 'Dorf', personCount: 2, animalCount: 1, buildings: [] }],
      people: [
        basePerson({ id: asEntityId(1), locationId: asLocationId(1) }),
        basePerson({ id: asEntityId(2), locationId: asLocationId(1), currentActivity: { kind: 'Traveling', destination: asLocationId(2) } }),
      ],
      animals: [
        {
          id: asEntityId(3),
          kind: 'animal',
          ageTicks: 10,
          lifeStage: 'child',
          locationId: asLocationId(1),
          needs: { hunger: 50, energy: 50 },
          currentActivity: { kind: 'Idle' },
          parentIds: [],
          childIds: [],
        },
      ],
      recentEvents: [],
    };
    const status: ControllerStatus = { state: 'running', currentTick: 10, ticksPerSecond: 2 };
    const graph: LocationGraphNode[] = [{ id: asLocationId(1), name: 'Dorf', connections: [{ to: asLocationId(2), travelTicks: 3 }] }];
    const vm = toWorldViewModel(snapshot, status, graph, []);

    expect(vm.status).toEqual(status);
    expect(vm.peopleCount).toBe(2);
    expect(vm.animalsCount).toBe(1);
    expect(vm.locations).toEqual([{ id: 1, name: 'Dorf', personCount: 2, animalCount: 1, connections: [{ to: 2, travelTicks: 3 }] }]);
    expect(vm.figures).toEqual([
      { id: 1, kind: 'person', locationId: 1, activityKind: 'Idle' },
      { id: 2, kind: 'person', locationId: 1, activityKind: 'Traveling' },
      { id: 3, kind: 'animal', locationId: 1, activityKind: 'Idle' },
    ]);
    expect((vm as unknown as { people?: unknown }).people).toBeUndefined();
  });
});

describe('toLocationDetailViewModel', () => {
  it('bildet kompakte Personen-/Tierlisten aus bereits gefilterten Observation-Daten', () => {
    const location: LocationObservation = { id: asLocationId(1), name: 'Dorf', personCount: 1, animalCount: 1, buildings: [{ id: asBuildingId(1), kind: 'Field' }] };
    const people = [{ id: asEntityId(1), displayName: 'Alex' } as PersonObservation];
    const animals = [{ id: asEntityId(2), species: 'Rabbit' } as AnimalObservation];
    const vm = toLocationDetailViewModel(location, people, animals);

    expect(vm.people).toEqual([{ id: 1, kind: 'person', displayName: 'Alex' }]);
    expect(vm.animals).toEqual([{ id: 2, kind: 'animal', displayName: 'Rabbit' }]);
    expect(vm.buildings).toEqual(location.buildings);
  });
});

function basePerson(overrides: Partial<PersonObservation> = {}): PersonObservation {
  return {
    id: asEntityId(1),
    kind: 'person',
    displayName: 'Alex',
    ageTicks: 500,
    lifeStage: 'adult',
    locationId: asLocationId(1),
    needs: { hunger: 50, energy: 60, social: 70 },
    currentActivity: { kind: 'Idle' },
    friendIds: [],
    parentIds: [],
    childIds: [],
    ...overrides,
  };
}

describe('toPersonDetailViewModel — Beziehungsnavigation (Partner/Freund/Elternteil/Kind)', () => {
  it('löst partnerId/friendIds/parentIds/childIds zu Namen auf', () => {
    const person = basePerson({ partnerId: asEntityId(2), friendIds: [asEntityId(3)], parentIds: [asEntityId(4)], childIds: [asEntityId(5)] });
    const others = new Map<number, PersonObservation>([
      [2, basePerson({ id: asEntityId(2), displayName: 'Mira' })],
      [3, basePerson({ id: asEntityId(3), displayName: 'Jonas' })],
      [4, basePerson({ id: asEntityId(4), displayName: 'Elin' })],
      [5, basePerson({ id: asEntityId(5), displayName: 'Kim' })],
    ]);

    const vm = toPersonDetailViewModel(person, (id) => others.get(id));

    expect(vm.partner).toEqual({ id: 2, displayName: 'Mira', stillAlive: true });
    expect(vm.friends).toEqual([{ id: 3, displayName: 'Jonas', stillAlive: true }]);
    expect(vm.parents).toEqual([{ id: 4, displayName: 'Elin', stillAlive: true }]);
    expect(vm.children).toEqual([{ id: 5, displayName: 'Kim', stillAlive: true }]);
  });

  it('markiert eine nicht mehr auflösbare (verstorbene) Beziehung explizit, statt sie zu verschweigen', () => {
    const person = basePerson({ friendIds: [asEntityId(99)] });
    const vm = toPersonDetailViewModel(person, () => undefined);

    expect(vm.friends[0]!.stillAlive).toBe(false);
    expect(vm.friends[0]!.displayName).toContain('nicht mehr auffindbar');
  });

  it('lässt partner undefined, wenn keine Partnerschaft besteht', () => {
    const vm = toPersonDetailViewModel(basePerson(), () => undefined);
    expect(vm.partner).toBeUndefined();
  });
});

describe('toAnimalDetailViewModel', () => {
  it('ergänzt keine sozialen Felder und löst Eltern/Kinder gegen andere Tiere auf', () => {
    const animal: AnimalObservation = {
      id: asEntityId(9),
      kind: 'animal',
      species: 'Rabbit',
      ageTicks: 12,
      lifeStage: 'child',
      locationId: asLocationId(1),
      needs: { hunger: 20, energy: 30 },
      currentActivity: { kind: 'Idle' },
      parentIds: [asEntityId(10)],
      childIds: [],
    };
    const parent: AnimalObservation = { ...animal, id: asEntityId(10), species: 'Rabbit-Parent' };

    const vm = toAnimalDetailViewModel(animal, (id) => (id === 10 ? parent : undefined));

    expect((vm as unknown as { needs: { social?: unknown } }).needs.social).toBeUndefined();
    expect(vm.parents).toEqual([{ id: 10, displayName: 'Rabbit-Parent', stillAlive: true }]);
  });
});
