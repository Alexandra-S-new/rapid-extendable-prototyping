import type { BuildingId, EntityId, LocationId } from './value-objects/ids.js';
import type { ResourceType, Season, Weather, DeathCause, BuildingConditionBand } from './value-objects/enums.js';

// SimEvent (Subtask 2 §7): discriminated union, rein additiv (Queue->History,
// ADR-06). Events referenzieren andere Objekte ausschließlich über deren ID.
export type SimEvent =
  | { type: 'BirthEvent'; sequence: number; tick: number; entityId: EntityId; parentIds: EntityId[] }
  | { type: 'DeathEvent'; sequence: number; tick: number; entityId: EntityId; cause: DeathCause }
  | {
      type: 'TradeEvent';
      sequence: number;
      tick: number;
      buyer: EntityId;
      seller: EntityId;
      resource: ResourceType;
      amount: number;
      price: number;
    }
  | {
      type: 'HarvestEvent';
      sequence: number;
      tick: number;
      buildingId: BuildingId;
      resource: ResourceType;
      amount: number;
    }
  | {
      type: 'MovementEvent';
      sequence: number;
      tick: number;
      entityId: EntityId;
      fromLocation: LocationId;
      toLocation: LocationId;
    }
  | { type: 'SeasonChangedEvent'; sequence: number; tick: number; season: Season }
  | { type: 'WeatherChangedEvent'; sequence: number; tick: number; weather: Weather }
  // v2, Subtask 9 §13/ADR-V2-08: einziges neues Event, nur bei Bandwechsel
  // (analog Season/WeatherChangedEvent), schließt die in Subtask 9 §17
  // identifizierte Observability-Lücke für Gebäudezustand.
  | {
      type: 'BuildingConditionChangedEvent';
      sequence: number;
      tick: number;
      buildingId: BuildingId;
      condition: number;
      band: BuildingConditionBand;
    };

export type SimEventType = SimEvent['type'];

// Event ohne die vom Emissions-Helper (ctx.emit) gesetzten Felder
// (Subtask 2 §7: tick/sequence werden zentral vergeben, nicht vom Aufrufer).
export type EmittedEvent = { [K in SimEvent['type']]: Omit<Extract<SimEvent, { type: K }>, 'sequence' | 'tick'> }[SimEvent['type']];
