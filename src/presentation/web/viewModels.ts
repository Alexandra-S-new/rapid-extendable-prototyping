import type { ControllerStatus } from '../../application/SimulationController.js';
import type {
  WorldSnapshot,
  PersonObservation,
  AnimalObservation,
  LocationObservation,
  LocationGraphNode,
  ActivityObservation,
} from '../../observability/WorldObserver.js';
import type { SimEvent } from '../../domain/events.js';
import type { EntityId, LocationId } from '../../domain/value-objects/ids.js';

// viewModels.ts (Subtask 23 §9/§26): reine, deterministische Presentation-
// Aufbereitung der bestehenden Observation-Daten (WorldSnapshot/
// PersonObservation/AnimalObservation/LocationObservation/SimEvent) für die
// Web-API. Enthält keine Fachlogik, keinen Zugriff auf WorldState/Engine —
// jede Funktion ist eine reine Abbildung bereits vorhandener,
// bereits kopierter Observation-Daten und daher ohne laufenden Server
// testbar (§26/§34).

export interface ActivityViewModel {
  readonly kind: 'Idle' | 'Traveling' | 'Performing';
  readonly label: string;
  readonly destination?: LocationId;
  readonly actionId?: string;
  readonly ticksInAction?: number;
}

export function toActivityViewModel(activity: ActivityObservation): ActivityViewModel {
  switch (activity.kind) {
    case 'Traveling':
      return { kind: 'Traveling', label: `Unterwegs nach Ort #${activity.destination}`, destination: activity.destination };
    case 'Performing':
      return {
        kind: 'Performing',
        label: `${activity.actionId} (seit ${activity.ticksInAction} Ticks)`,
        actionId: activity.actionId,
        ticksInAction: activity.ticksInAction,
      };
    default:
      return { kind: 'Idle', label: 'Idle' };
  }
}

export interface EventLink {
  readonly kind: 'person' | 'location';
  readonly id: number;
  readonly label: string;
}

export interface EventViewModel {
  readonly sequence: number;
  readonly tick: number;
  readonly type: SimEvent['type'];
  readonly summary: string;
  readonly links: readonly EventLink[];
}

// Navigation wird nur angeboten, wenn eine Ziel-ID unmittelbar und
// eindeutig auf dem Event selbst vorhanden ist (Subtask 23 §18) — z. B. hat
// DeathEvent zwar eine entityId, aber die Entity ist per Definition nicht
// mehr lebend/beobachtbar; HarvestEvent/BuildingConditionChangedEvent tragen
// keinen Ort direkt, nur eine buildingId (Ortszuordnung wäre eine
// Cross-Referenz, keine unmittelbare Ableitung). Für diese Fälle wird
// bewusst kein Link erzeugt, statt eine Navigation anzubieten, die nur ins
// Leere (404) führen kann.
export function toEventViewModel(event: SimEvent): EventViewModel {
  const personLink = (id: EntityId): EventLink => ({ kind: 'person', id, label: `Person #${id}` });
  const locationLink = (id: LocationId): EventLink => ({ kind: 'location', id, label: `Ort #${id}` });

  switch (event.type) {
    case 'BirthEvent':
      return {
        sequence: event.sequence,
        tick: event.tick,
        type: event.type,
        summary: `Geburt: Person #${event.entityId}${event.parentIds.length > 0 ? ` (Eltern: ${event.parentIds.join(', ')})` : ''}`,
        links: [personLink(event.entityId), ...event.parentIds.map(personLink)],
      };
    case 'DeathEvent':
      return {
        sequence: event.sequence,
        tick: event.tick,
        type: event.type,
        summary: `Tod: Entity #${event.entityId} (${event.cause === 'starvation' ? 'Hunger' : 'Alter'})`,
        links: [],
      };
    case 'TradeEvent':
      return {
        sequence: event.sequence,
        tick: event.tick,
        type: event.type,
        summary: `Handel: #${event.buyer} kauft ${event.amount} ${event.resource} von #${event.seller} (Preis ${event.price})`,
        links: [personLink(event.buyer), personLink(event.seller)],
      };
    case 'HarvestEvent':
      return {
        sequence: event.sequence,
        tick: event.tick,
        type: event.type,
        summary: `Ernte: Gebäude #${event.buildingId} produziert ${event.amount} ${event.resource}`,
        links: [],
      };
    case 'MovementEvent':
      return {
        sequence: event.sequence,
        tick: event.tick,
        type: event.type,
        summary: `Bewegung: #${event.entityId} von Ort #${event.fromLocation} nach Ort #${event.toLocation}`,
        links: [personLink(event.entityId), locationLink(event.fromLocation), locationLink(event.toLocation)],
      };
    case 'SeasonChangedEvent':
      return { sequence: event.sequence, tick: event.tick, type: event.type, summary: `Jahreszeit gewechselt: ${event.season}`, links: [] };
    case 'WeatherChangedEvent':
      return { sequence: event.sequence, tick: event.tick, type: event.type, summary: `Wetter gewechselt: ${event.weather}`, links: [] };
    case 'BuildingConditionChangedEvent':
      return {
        sequence: event.sequence,
        tick: event.tick,
        type: event.type,
        summary: `Gebäudezustand #${event.buildingId}: ${event.condition.toFixed(1)} (${event.band})`,
        links: [],
      };
  }
}

// Neueste zuerst (Subtask 23 §17) — bewusst abweichend von der
// chronologisch aufsteigenden Reihenfolge der bestehenden CLI
// (interactiveFormat.ts), die für die Web-Oberfläche eigenständig gilt.
export function toEventViewModels(events: readonly SimEvent[]): EventViewModel[] {
  return [...events].reverse().map(toEventViewModel);
}

export interface LocationSummaryViewModel {
  readonly id: LocationId;
  readonly name: string;
  readonly personCount: number;
  readonly animalCount: number;
  readonly connections: readonly { readonly to: LocationId; readonly travelTicks: number }[];
}

// FigureViewModel (Subtask 25 §4.1/§12): minimale, ausschließlich für die
// Kartendarstellung nötige Projektion einer lebenden Entity — bewusst NICHT
// die volle PersonObservation/AnimalObservation (keine Namen/Bedürfnisse/
// Beziehungen), sondern nur, was ein Marker auf der Karte tatsächlich
// braucht: wo er steht, welche Art er ist, und ob er sich gerade bewegt
// (activityKind==='Traveling' — ausschließlich der bereits existierende,
// echte Aktivitätszustand, keine erfundene Bewegung, Subtask 25 §4.2).
export interface FigureViewModel {
  readonly id: EntityId;
  readonly kind: 'person' | 'animal';
  readonly locationId: LocationId;
  readonly activityKind: 'Idle' | 'Traveling' | 'Performing';
}

export interface WorldViewModel {
  readonly status: ControllerStatus;
  readonly tick: number;
  readonly season: string;
  readonly weather: string;
  readonly peopleCount: number;
  readonly animalsCount: number;
  readonly locations: readonly LocationSummaryViewModel[];
  readonly figures: readonly FigureViewModel[];
  readonly recentEvents: readonly EventViewModel[];
}

// toWorldViewModel (Subtask 22 §26.6/Subtask 23 §12): bewusst reduzierte
// Projektion — keine vollständigen Personen-/Tierlisten (das wäre die in
// Subtask 22 §26.6/§26.12 beschriebene Datenwand), nur aggregierte Zählung
// je Ort plus der bereits vom Aufrufer begrenzten Ereignisliste (niemals die
// volle History — Subtask 22 §26.15 Hinweis zu getRecentEvents()).
export function toWorldViewModel(
  snapshot: WorldSnapshot,
  status: ControllerStatus,
  graph: readonly LocationGraphNode[],
  boundedRecentEvents: readonly SimEvent[],
): WorldViewModel {
  const connectionsByLocation = new Map(graph.map((node) => [node.id, node.connections]));
  return {
    status,
    tick: snapshot.tick,
    season: snapshot.season,
    weather: snapshot.weather,
    peopleCount: snapshot.people.length,
    animalsCount: snapshot.animals.length,
    locations: snapshot.locations.map((location) => ({
      id: location.id,
      name: location.name,
      personCount: location.personCount,
      animalCount: location.animalCount,
      connections: connectionsByLocation.get(location.id) ?? [],
    })),
    figures: [
      ...snapshot.people.map((p) => ({ id: p.id, kind: 'person' as const, locationId: p.locationId, activityKind: p.currentActivity.kind })),
      ...snapshot.animals.map((a) => ({ id: a.id, kind: 'animal' as const, locationId: a.locationId, activityKind: a.currentActivity.kind })),
    ],
    recentEvents: toEventViewModels(boundedRecentEvents),
  };
}

export interface EntitySummaryViewModel {
  readonly id: EntityId;
  readonly kind: 'person' | 'animal';
  readonly displayName: string;
}

export interface LocationDetailViewModel {
  readonly id: LocationId;
  readonly name: string;
  readonly personCount: number;
  readonly animalCount: number;
  readonly buildings: LocationObservation['buildings'];
  readonly people: readonly EntitySummaryViewModel[];
  readonly animals: readonly EntitySummaryViewModel[];
}

// toLocationDetailViewModel (Subtask 23 §14): LocationObservation selbst
// enthält keine Liste der dort befindlichen Entities (nur Zählung) — die
// Zuordnung "wer ist hier" ist reine Filterung bereits vorhandener
// PersonObservation/AnimalObservation-Daten (aus getWorldSnapshot()) nach
// locationId, keine neue Observation-Fähigkeit.
export function toLocationDetailViewModel(
  location: LocationObservation,
  peopleHere: readonly PersonObservation[],
  animalsHere: readonly AnimalObservation[],
): LocationDetailViewModel {
  return {
    id: location.id,
    name: location.name,
    personCount: location.personCount,
    animalCount: location.animalCount,
    buildings: location.buildings,
    people: peopleHere.map((p) => ({ id: p.id, kind: 'person', displayName: p.displayName })),
    animals: animalsHere.map((a) => ({ id: a.id, kind: 'animal', displayName: a.species ?? `Tier #${a.id}` })),
  };
}

export interface RelatedPersonRef {
  readonly id: EntityId;
  readonly displayName: string;
  readonly stillAlive: boolean;
}

export interface PersonDetailViewModel {
  readonly id: EntityId;
  readonly displayName: string;
  readonly role?: string;
  readonly ageTicks: number;
  readonly lifeStage: string;
  readonly locationId: LocationId;
  readonly needs: { readonly hunger: number; readonly energy: number; readonly social: number };
  readonly activity: ActivityViewModel;
  readonly partner?: RelatedPersonRef;
  readonly friends: readonly RelatedPersonRef[];
  readonly parents: readonly RelatedPersonRef[];
  readonly children: readonly RelatedPersonRef[];
}

// toPersonDetailViewModel (Subtask 23 §15): löst partnerId/friendIds/
// parentIds/childIds zu Namen auf (statt roher IDs, "Partner: Mira" gemäß
// Subtask 22 §26.10-Mockup), über einen injizierten Resolver — bleibt damit
// pur/ohne WorldObserver-Abhängigkeit testbar. Eine nicht mehr auflösbare ID
// (verstorbene Person) wird nicht verschwiegen, sondern explizit als solche
// markiert (kein "stale state", konsistent mit Subtask 22 §23-Prinzip).
export function toPersonDetailViewModel(
  person: PersonObservation,
  resolvePerson: (id: EntityId) => PersonObservation | undefined,
): PersonDetailViewModel {
  const ref = (id: EntityId): RelatedPersonRef => {
    const resolved = resolvePerson(id);
    return resolved
      ? { id, displayName: resolved.displayName, stillAlive: true }
      : { id, displayName: `Person #${id} (nicht mehr auffindbar)`, stillAlive: false };
  };
  return {
    id: person.id,
    displayName: person.displayName,
    role: person.role,
    ageTicks: person.ageTicks,
    lifeStage: person.lifeStage,
    locationId: person.locationId,
    needs: person.needs,
    activity: toActivityViewModel(person.currentActivity),
    partner: person.partnerId !== undefined ? ref(person.partnerId) : undefined,
    friends: person.friendIds.map(ref),
    parents: person.parentIds.map(ref),
    children: person.childIds.map(ref),
  };
}

export interface AnimalDetailViewModel {
  readonly id: EntityId;
  readonly species?: string;
  readonly ageTicks: number;
  readonly lifeStage: string;
  readonly locationId: LocationId;
  readonly needs: { readonly hunger: number; readonly energy: number };
  readonly activity: ActivityViewModel;
  readonly parents: readonly RelatedPersonRef[];
  readonly children: readonly RelatedPersonRef[];
}

// Keine künstlichen sozialen Daten für Tiere (Subtask 23 §16) — Eltern/
// Kinder werden analog zu Personen aufgelöst, aber ausschließlich gegen
// andere Tiere (kein social-Feld, kein partner/friends).
export function toAnimalDetailViewModel(
  animal: AnimalObservation,
  resolveAnimal: (id: EntityId) => AnimalObservation | undefined,
): AnimalDetailViewModel {
  const ref = (id: EntityId): RelatedPersonRef => {
    const resolved = resolveAnimal(id);
    return resolved
      ? { id, displayName: resolved.species ?? `Tier #${id}`, stillAlive: true }
      : { id, displayName: `Tier #${id} (nicht mehr auffindbar)`, stillAlive: false };
  };
  return {
    id: animal.id,
    species: animal.species,
    ageTicks: animal.ageTicks,
    lifeStage: animal.lifeStage,
    locationId: animal.locationId,
    needs: animal.needs,
    activity: toActivityViewModel(animal.currentActivity),
    parents: animal.parentIds.map(ref),
    children: animal.childIds.map(ref),
  };
}
