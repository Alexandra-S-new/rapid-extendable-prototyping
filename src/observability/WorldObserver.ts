import type { WorldStateReader } from '../world/WorldState.js';
import type { EntityId, LocationId, BuildingId, ActionId } from '../domain/value-objects/ids.js';
import type { Season, Weather, Role, BuildingKind } from '../domain/value-objects/enums.js';
import type { Identity } from '../domain/components/identity.js';
import type { Activity } from '../domain/components/ai-state.js';
import { deriveLifeStage, type LifeStage } from '../domain/components/age.js';
import { hasSocialNeed } from '../domain/components/needs.js';
import type { SimEvent, SimEventType } from '../domain/events.js';
import type { SimulationConfig } from '../config/schema.js';
import { queryEventHistory } from './EventHistoryView.js';

// WorldObserver (Subtask 20, gemäß Subtask 19 §32.5/§32.9/§32.10): Observation
// Layer, Erweiterung des bestehenden observability/-Moduls (analog
// EntityInspector/StatisticsReporter/EventHistoryView — rein lesende
// Funktionen über WorldStateReader). Liefert im Unterschied zur bestehenden
// EntityInspector-Sicht KEINE Referenzen auf mutable Domain-Objekte, sondern
// tatsächlich unabhängige Plain-Data-Kopien (Subtask 19 §32.5: die
// bestehende WorldStateReader-Typisierung ist nur compile-zeitig readonly,
// keine Laufzeitgarantie). Keine neuen Domain-Felder, keine neuen Events
// (Subtask 19 §32.4/§14) — lifeStage wird wie im Domänenmodell selbst rein
// abgeleitet (deriveLifeStage), nicht gespeichert.

export type ActivityObservation =
  | { readonly kind: 'Idle' }
  | { readonly kind: 'Traveling'; readonly destination: LocationId }
  | { readonly kind: 'Performing'; readonly actionId: ActionId; readonly ticksInAction: number };

export interface PersonObservation {
  readonly id: EntityId;
  readonly kind: 'person';
  readonly displayName: string;
  readonly role?: Role;
  readonly ageTicks: number;
  readonly lifeStage: LifeStage;
  readonly locationId: LocationId;
  readonly needs: { readonly hunger: number; readonly energy: number; readonly social: number };
  readonly currentActivity: ActivityObservation;
  readonly partnerId?: EntityId;
  readonly friendIds: readonly EntityId[];
  readonly parentIds: readonly EntityId[];
  readonly childIds: readonly EntityId[];
}

export interface AnimalObservation {
  readonly id: EntityId;
  readonly kind: 'animal';
  readonly species?: string;
  readonly ageTicks: number;
  readonly lifeStage: LifeStage;
  readonly locationId: LocationId;
  readonly needs: { readonly hunger: number; readonly energy: number };
  readonly currentActivity: ActivityObservation;
  readonly parentIds: readonly EntityId[];
  readonly childIds: readonly EntityId[];
}

export interface LocationBuildingObservation {
  readonly id: BuildingId;
  readonly kind: BuildingKind;
  readonly condition?: number;
}

export interface LocationObservation {
  readonly id: LocationId;
  readonly name: string;
  readonly personCount: number;
  readonly animalCount: number;
  readonly buildings: readonly LocationBuildingObservation[];
}

export interface WorldSnapshot {
  readonly tick: number;
  readonly season: Season;
  readonly weather: Weather;
  readonly locations: readonly LocationObservation[];
  readonly people: readonly PersonObservation[];
  readonly animals: readonly AnimalObservation[];
  readonly recentEvents: readonly SimEvent[];
}

// LocationGraphNode (Subtask 23 §13): minimale, rein durchreichende
// Erweiterung der Observation Layer. LocationObservation trägt bewusst keine
// Verbindungsinformation; die beim Start bekannte Config wird nach einem
// SimulationController.load() nicht mehr aktualisiert und wäre daher nach
// einem Laden mit abweichendem Orts-Graphen unsicher. connections stammen
// unverändert aus dem bereits im WorldState/SaveFile vorhandenen
// Location.connections (kein neuer Zustand, keine neue Logik).
export interface LocationGraphNode {
  readonly id: LocationId;
  readonly name: string;
  readonly connections: readonly { readonly to: LocationId; readonly travelTicks: number }[];
}

function cloneActivity(activity: Activity): ActivityObservation {
  switch (activity.kind) {
    case 'Traveling':
      return { kind: 'Traveling', destination: activity.destination };
    case 'Performing':
      return { kind: 'Performing', actionId: activity.actionId, ticksInAction: activity.ticksInAction };
    default:
      return { kind: 'Idle' };
  }
}

// cloneEvent: RingBuffer.toArray() liefert bereits ein frisches Array
// (world/RingBuffer.ts), aber dieselben Event-Objektreferenzen. Da Events im
// bestehenden Modell nach Emission nie mutiert werden (rein additiv,
// Queue->History, ADR-06), wäre das in der Praxis unkritisch — zur
// Einhaltung von "keine Referenzen auf mutable Domain-Objekte nach außen"
// wird hier trotzdem defensiv kopiert (inkl. des einzigen Array-Feldes,
// BirthEvent.parentIds).
function cloneEvent(event: SimEvent): SimEvent {
  if (event.type === 'BirthEvent') {
    return { ...event, parentIds: [...event.parentIds] };
  }
  return { ...event };
}

export class WorldObserver {
  constructor(
    private readonly world: WorldStateReader,
    private readonly config: SimulationConfig,
  ) {}

  // O(n) über entities.alive + O(l) über locations + O(b) über buildings —
  // keine verschachtelte Entity×Location-Iteration (Subtask 19 §32.12).
  getWorldSnapshot(): WorldSnapshot {
    const people: PersonObservation[] = [];
    const animals: AnimalObservation[] = [];

    // entities.alive ist dokumentiert sortiert gehalten (world/WorldState.ts)
    // -> stabile, deterministische Reihenfolge ohne eigene Sortierung
    // (Subtask 19 §32.13 Punkt 5).
    for (const entityId of this.world.entities.alive) {
      const identity = this.world.components.identity.get(entityId);
      if (!identity) continue;
      if (identity.kind === 'person') {
        const observation = this.buildPersonObservation(entityId, identity);
        if (observation) people.push(observation);
      } else {
        const observation = this.buildAnimalObservation(entityId, identity);
        if (observation) animals.push(observation);
      }
    }

    return {
      tick: this.world.clock.currentTick,
      season: this.world.environment.season,
      weather: this.world.environment.weather,
      locations: this.buildLocationObservations(),
      people,
      animals,
      recentEvents: this.getRecentEvents(),
    };
  }

  getPersonObservation(id: EntityId): PersonObservation | undefined {
    const identity = this.world.components.identity.get(id);
    if (!identity || identity.kind !== 'person') return undefined;
    return this.buildPersonObservation(id, identity);
  }

  getAnimalObservation(id: EntityId): AnimalObservation | undefined {
    const identity = this.world.components.identity.get(id);
    if (!identity || identity.kind !== 'animal') return undefined;
    return this.buildAnimalObservation(id, identity);
  }

  getLocationObservation(id: LocationId): LocationObservation | undefined {
    return this.buildLocationObservations().find((l) => l.id === id);
  }

  getRecentEvents(options: { last?: number; type?: SimEventType } = {}): SimEvent[] {
    return queryEventHistory(this.world, options).map(cloneEvent);
  }

  getLocationGraph(): LocationGraphNode[] {
    return this.world.environment.locations.map((location) => ({
      id: location.id,
      name: location.name,
      connections: location.connections.map((c) => ({ to: c.to, travelTicks: c.travelTicks })),
    }));
  }

  private buildPersonObservation(id: EntityId, identity: Identity): PersonObservation | undefined {
    const position = this.world.components.position.get(id);
    const needs = this.world.components.needs.get(id);
    const age = this.world.components.age.get(id);
    const aiState = this.world.components.aiState.get(id);
    const relationships = this.world.components.relationships.get(id);
    if (!position || !needs || !age || !aiState || !relationships || !hasSocialNeed(needs)) return undefined;

    return {
      id,
      kind: 'person',
      displayName: identity.displayName,
      ...(identity.role !== undefined ? { role: identity.role } : {}),
      ageTicks: age.ticksAlive,
      lifeStage: deriveLifeStage(age, this.config.reproduction.minAdultAgeTicks),
      locationId: position.locationId,
      needs: { hunger: needs.hunger, energy: needs.energy, social: needs.social },
      currentActivity: cloneActivity(aiState.currentActivity),
      ...(relationships.partnerId !== undefined ? { partnerId: relationships.partnerId } : {}),
      friendIds: [...relationships.friendIds],
      parentIds: [...relationships.parentIds],
      childIds: [...relationships.childIds],
    };
  }

  private buildAnimalObservation(id: EntityId, identity: Identity): AnimalObservation | undefined {
    const position = this.world.components.position.get(id);
    const needs = this.world.components.needs.get(id);
    const age = this.world.components.age.get(id);
    const aiState = this.world.components.aiState.get(id);
    const relationships = this.world.components.relationships.get(id);
    if (!position || !needs || !age || !aiState || !relationships) return undefined;

    return {
      id,
      kind: 'animal',
      ...(identity.species !== undefined ? { species: identity.species } : {}),
      ageTicks: age.ticksAlive,
      lifeStage: deriveLifeStage(age, this.config.reproduction.minAdultAgeTicks),
      locationId: position.locationId,
      needs: { hunger: needs.hunger, energy: needs.energy },
      currentActivity: cloneActivity(aiState.currentActivity),
      parentIds: [...relationships.parentIds],
      childIds: [...relationships.childIds],
    };
  }

  // Einmaliges Bucketing über alle Entities/Buildings statt einer
  // Pro-Ort-Abfrage (Subtask 19 §32.12: identisches Muster wie
  // SocialBondingSystem.socializingByLocation) -> O(n + b + l), kein O(n*l).
  private buildLocationObservations(): LocationObservation[] {
    const personCounts = new Map<LocationId, number>();
    const animalCounts = new Map<LocationId, number>();

    for (const entityId of this.world.entities.alive) {
      const position = this.world.components.position.get(entityId);
      const identity = this.world.components.identity.get(entityId);
      if (!position || !identity) continue;
      const counts = identity.kind === 'person' ? personCounts : animalCounts;
      counts.set(position.locationId, (counts.get(position.locationId) ?? 0) + 1);
    }

    const buildingsByLocation = new Map<LocationId, LocationBuildingObservation[]>();
    for (const building of this.world.environment.buildings) {
      const list = buildingsByLocation.get(building.locationId) ?? [];
      list.push({ id: building.id, kind: building.kind, ...(building.condition !== undefined ? { condition: building.condition } : {}) });
      buildingsByLocation.set(building.locationId, list);
    }

    return this.world.environment.locations.map((location) => ({
      id: location.id,
      name: location.name,
      personCount: personCounts.get(location.id) ?? 0,
      animalCount: animalCounts.get(location.id) ?? 0,
      buildings: buildingsByLocation.get(location.id) ?? [],
    }));
  }
}
