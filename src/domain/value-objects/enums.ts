// Domain enums / value types (Subtask 1 §4: Domänenbegriffe als Enums statt Strings).

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export const SEASONS: readonly Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

export type Weather = 'Clear' | 'Rain' | 'Storm' | 'Snow';

export const WEATHERS: readonly Weather[] = ['Clear', 'Rain', 'Storm', 'Snow'];

export type ResourceType = 'Food' | 'Wood';

export const RESOURCE_TYPES: readonly ResourceType[] = ['Food', 'Wood'];

export type BuildingKind = 'House' | 'Field' | 'Market' | 'Workplace';

export type EntityKind = 'person' | 'animal';

export type DeathCause = 'starvation' | 'old_age';

// Role (v2, Subtask 9 §7/ADR-V2-04): optionale, unveränderliche
// Rollenzuweisung — nur initial vergeben, kein Rollenwechsel in v2.
export type Role = 'Farmer' | 'Lumberjack';

// BuildingConditionBand (v2, Subtask 9 §13/ADR-V2-08): Bandwechsel-Klassen
// für BuildingConditionChangedEvent, analog zu Season/Weather-Änderungen.
export type BuildingConditionBand = 'healthy' | 'degraded' | 'critical';
