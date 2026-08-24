import type { BuildingId, LocationId } from './value-objects/ids.js';
import type { BuildingKind, ResourceType } from './value-objects/enums.js';

// Location, Building (Subtask 3 §3.1/§4.3): statische Weltobjekte, kein Teil
// des EntityId-Component-Store-Mechanismus.

export interface Connection {
  to: LocationId;
  travelTicks: number;
}

export interface Location {
  id: LocationId;
  name: string;
  connections: Connection[];
  // Datenfeld vorhanden, in v1 nicht durchgesetzt (Subtask 2 §10).
  capacity?: number;
  buildingIds: BuildingId[];
}

// condition (v2, Subtask 9 §6/ADR-V2-03): nur für Gebäude mit definierter
// Produktionszuordnung (Field->Food, Workplace->Wood; V2-I5) — House/Market
// erhalten kein condition-Feld (kein ungenutztes Feld, Subtask 3.6b-Prinzip).
export interface Building {
  id: BuildingId;
  kind: BuildingKind;
  inventory: Record<ResourceType, number>;
  locationId: LocationId;
  condition?: number;
}

// productiveResourceFor (Subtask 4 Work.ts/ProductionSystem.ts, konsolidiert
// v2 Subtask 10): einzige Quelle der Zuordnung 'Field' -> Food,
// 'Workplace' -> Wood (02 §5/§11: "Feld -> Food, Wald -> Wood", auf die vier
// vorhandenen BuildingKind-Werte abgebildet). Vormals in Work.ts und
// ProductionSystem.ts duplizierte Funktionen, hier zusammengeführt, um
// Drift zwischen den Stellen zu vermeiden (Subtask 6, Codequalität).
export function productiveResourceFor(kind: BuildingKind): ResourceType | undefined {
  if (kind === 'Field') return 'Food';
  if (kind === 'Workplace') return 'Wood';
  return undefined;
}
