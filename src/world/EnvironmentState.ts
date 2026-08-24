import type { LocationId, BuildingId } from '../domain/value-objects/ids.js';
import type { BuildingKind, ResourceType, Season, Weather } from '../domain/value-objects/enums.js';
import { productiveResourceFor, type Location, type Building, type Connection } from '../domain/environment.js';

// EnvironmentState (Subtask 2 §16, Subtask 3 §4.3, Subtask 3.8): baut den
// statischen Location-/Building-Graphen. Location.buildingIds wird einmalig
// aus Building.locationId abgeleitet — keine zweite, unabhängig authorierte
// Quelle (Subtask 3.8, verbindlich).

export interface LocationInput {
  id: LocationId;
  name: string;
  connections: Connection[];
  capacity?: number;
}

export interface BuildingInput {
  id: BuildingId;
  kind: BuildingKind;
  locationId: LocationId;
}

export function buildEnvironment(
  locationInputs: readonly LocationInput[],
  buildingInputs: readonly BuildingInput[],
  initialSeason: Season,
  initialWeather: Weather,
): { season: Season; weather: Weather; locations: Location[]; buildings: Building[] } {
  const buildingIdsByLocation = new Map<LocationId, BuildingId[]>();
  for (const input of buildingInputs) {
    const list = buildingIdsByLocation.get(input.locationId) ?? [];
    list.push(input.id);
    buildingIdsByLocation.set(input.locationId, list);
  }

  const locations: Location[] = locationInputs.map((input) => ({
    id: input.id,
    name: input.name,
    connections: input.connections,
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    buildingIds: buildingIdsByLocation.get(input.id) ?? [],
  }));

  // v2, Subtask 9 §6 (V2-I5): condition:100 (voll instand) nur für Gebäude
  // mit definierter Produktionszuordnung — nie ein ungenutztes Feld auf
  // House/Market.
  const buildings: Building[] = buildingInputs.map((input) => ({
    id: input.id,
    kind: input.kind,
    locationId: input.locationId,
    inventory: emptyResourceAmounts(),
    ...(productiveResourceFor(input.kind) !== undefined ? { condition: 100 } : {}),
  }));

  return { season: initialSeason, weather: initialWeather, locations, buildings };
}

function emptyResourceAmounts(): Record<ResourceType, number> {
  return { Food: 0, Wood: 0 };
}
