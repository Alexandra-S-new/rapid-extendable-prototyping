import type { ControllerStatus } from '../application/SimulationController.js';
import type {
  ActivityObservation,
  AnimalObservation,
  LocationObservation,
  PersonObservation,
  WorldSnapshot,
} from '../observability/WorldObserver.js';
import type { SimEvent } from '../domain/events.js';

// interactiveFormat.ts (Subtask 20): reine, deterministische Parsing-/
// Formatierungsfunktionen für den interaktiven Einstiegspunkt
// (presentation/interactive.ts) — bewusst getrennt von der I/O-Schleife
// (readline/stdin/stdout), damit sie ohne echtes Terminal testbar sind.
// Enthält keine Fachlogik, nur Textdarstellung bereits vorhandener
// Observation-/Status-Daten (Presentation-Schicht, 02 §18).

export type MenuCommand =
  | { readonly kind: 'Start' }
  | { readonly kind: 'Pause' }
  | { readonly kind: 'Resume' }
  | { readonly kind: 'Step' }
  | { readonly kind: 'SetSpeed' }
  | { readonly kind: 'ShowWorld' }
  | { readonly kind: 'InspectPerson' }
  | { readonly kind: 'InspectAnimal' }
  | { readonly kind: 'InspectLocation' }
  | { readonly kind: 'ShowEvents' }
  | { readonly kind: 'Save' }
  | { readonly kind: 'Load' }
  | { readonly kind: 'Exit' };

export const MENU: ReadonlyArray<{ readonly label: string; readonly command: MenuCommand }> = [
  { label: 'Start', command: { kind: 'Start' } },
  { label: 'Pause', command: { kind: 'Pause' } },
  { label: 'Resume', command: { kind: 'Resume' } },
  { label: 'Step', command: { kind: 'Step' } },
  { label: 'Geschwindigkeit ändern', command: { kind: 'SetSpeed' } },
  { label: 'Weltübersicht anzeigen', command: { kind: 'ShowWorld' } },
  { label: 'Person untersuchen', command: { kind: 'InspectPerson' } },
  { label: 'Tier untersuchen', command: { kind: 'InspectAnimal' } },
  { label: 'Ort untersuchen', command: { kind: 'InspectLocation' } },
  { label: 'Ereignisse anzeigen', command: { kind: 'ShowEvents' } },
  { label: 'Save', command: { kind: 'Save' } },
  { label: 'Load', command: { kind: 'Load' } },
  { label: 'Exit', command: { kind: 'Exit' } },
];

export function formatMenu(): string {
  return MENU.map((entry, i) => `${i + 1}) ${entry.label}`).join('\n');
}

export function parseMenuChoice(input: string): MenuCommand | undefined {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const index = Number.parseInt(trimmed, 10);
  if (index < 1 || index > MENU.length) return undefined;
  return MENU[index - 1]!.command;
}

export function formatStatus(status: ControllerStatus): string {
  return `Status: ${status.state} | Tick: ${status.currentTick} | Geschwindigkeit: ${status.ticksPerSecond} Ticks/s`;
}

export function describeActivity(activity: ActivityObservation): string {
  switch (activity.kind) {
    case 'Idle':
      return 'Idle';
    case 'Traveling':
      return `Unterwegs nach Ort #${activity.destination}`;
    case 'Performing':
      return `${activity.actionId} (seit ${activity.ticksInAction} Ticks)`;
  }
}

export function describeEvent(event: SimEvent): string {
  switch (event.type) {
    case 'BirthEvent':
      return `Geburt: Entity #${event.entityId} (Eltern: ${event.parentIds.join(', ') || '—'})`;
    case 'DeathEvent':
      return `Tod: Entity #${event.entityId} (${event.cause})`;
    case 'TradeEvent':
      return `Handel: #${event.buyer} kauft ${event.amount} ${event.resource} von #${event.seller} (Preis ${event.price})`;
    case 'HarvestEvent':
      return `Ernte: Gebäude #${event.buildingId} produziert ${event.amount} ${event.resource}`;
    case 'MovementEvent':
      return `Bewegung: #${event.entityId} von Ort #${event.fromLocation} nach Ort #${event.toLocation}`;
    case 'SeasonChangedEvent':
      return `Jahreszeit gewechselt: ${event.season}`;
    case 'WeatherChangedEvent':
      return `Wetter gewechselt: ${event.weather}`;
    case 'BuildingConditionChangedEvent':
      return `Gebäudezustand #${event.buildingId}: ${event.condition} (${event.band})`;
  }
}

export function formatEvents(events: readonly SimEvent[]): string {
  if (events.length === 0) return '(keine Ereignisse)';
  return events.map((event) => `[tick ${event.tick}] ${describeEvent(event)}`).join('\n');
}

export function formatWorldOverview(snapshot: WorldSnapshot): string {
  const lines: string[] = [];
  lines.push(`Living World — Tick ${snapshot.tick} (${snapshot.season}, ${snapshot.weather})`);
  lines.push('');
  lines.push('Orte:');
  for (const location of snapshot.locations) {
    lines.push(`  ${location.name} (#${location.id}): ${location.personCount} Personen, ${location.animalCount} Tiere`);
  }
  lines.push('');
  lines.push(`Personen: ${snapshot.people.length} lebend`);
  lines.push(`Tiere: ${snapshot.animals.length} lebend`);
  lines.push('');
  lines.push('Jüngste Ereignisse:');
  lines.push(indent(formatEvents(snapshot.recentEvents.slice(-10))));
  return lines.join('\n');
}

export function formatPerson(person: PersonObservation | undefined): string {
  if (!person) return 'Unbekannte oder nicht (mehr) existierende Person.';
  return [
    `Person #${person.id}: ${person.displayName}${person.role ? ` (${person.role})` : ''}`,
    `  Lebensphase: ${person.lifeStage}, Alter: ${person.ageTicks} Ticks`,
    `  Ort: #${person.locationId}`,
    `  Bedürfnisse: Hunger ${person.needs.hunger.toFixed(1)}, Energie ${person.needs.energy.toFixed(1)}, Sozial ${person.needs.social.toFixed(1)}`,
    `  Aktivität: ${describeActivity(person.currentActivity)}`,
    `  Partner: ${person.partnerId !== undefined ? `#${person.partnerId}` : '(keine)'}`,
    `  Freunde: ${person.friendIds.length > 0 ? person.friendIds.join(', ') : '(keine)'}`,
    `  Eltern: ${person.parentIds.length > 0 ? person.parentIds.join(', ') : '(keine)'}`,
    `  Kinder: ${person.childIds.length > 0 ? person.childIds.join(', ') : '(keine)'}`,
  ].join('\n');
}

export function formatAnimal(animal: AnimalObservation | undefined): string {
  if (!animal) return 'Unbekanntes oder nicht (mehr) existierendes Tier.';
  return [
    `Tier #${animal.id}${animal.species ? ` (${animal.species})` : ''}`,
    `  Lebensphase: ${animal.lifeStage}, Alter: ${animal.ageTicks} Ticks`,
    `  Ort: #${animal.locationId}`,
    `  Bedürfnisse: Hunger ${animal.needs.hunger.toFixed(1)}, Energie ${animal.needs.energy.toFixed(1)}`,
    `  Aktivität: ${describeActivity(animal.currentActivity)}`,
    `  Eltern: ${animal.parentIds.length > 0 ? animal.parentIds.join(', ') : '(keine)'}`,
    `  Kinder: ${animal.childIds.length > 0 ? animal.childIds.join(', ') : '(keine)'}`,
  ].join('\n');
}

export function formatLocation(location: LocationObservation | undefined): string {
  if (!location) return 'Unbekannter Ort.';
  const lines = [
    `Ort #${location.id}: ${location.name}`,
    `  Personen: ${location.personCount}, Tiere: ${location.animalCount}`,
    '  Gebäude:',
  ];
  if (location.buildings.length === 0) {
    lines.push('    (keine)');
  } else {
    for (const building of location.buildings) {
      lines.push(`    #${building.id} ${building.kind}${building.condition !== undefined ? ` (Zustand: ${building.condition.toFixed(1)})` : ''}`);
    }
  }
  return lines.join('\n');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
