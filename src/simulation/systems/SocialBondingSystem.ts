import type { EntityId } from '../../domain/value-objects/ids.js';
import type { WorldState } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';

// SocialBondingSystem (A1, Subtask 15-17, ADR-A1-02): erkennt deterministisch,
// wenn zwei oder mehr Personen gleichzeitig am selben Ort die Socialize-Action
// ausführen, und erzeugt daraus reziproke, NICHT exklusive Freundschaften
// (Relationships.friendIds, V2-A1-I2). Eigenständiges System (Single
// Responsibility, analog MaintenanceSystem/ADR-V2-03 statt Erweiterung von
// PopulationSystem/Socialize selbst), Resolution-Phase, nach PopulationSystem
// (docs/07 §9/§10). Kein RNG (ADR-A1-02, V2-A1 verwendet keinen neuen
// Substream) — Kandidaten werden pro Ort nach EntityId sortiert, danach
// sequenziell zu Paaren zusammengefasst (dieselbe Grundfigur wie die
// bestehende Fortpflanzungs-Paarbildung in PopulationSystem.buildPairs, 03
// §12) statt jede Kombination zu bilden: Freundschaft ist zwar nicht
// exklusiv (V2-A1-I6) — mehrere Freunde entstehen über mehrere Ticks mit
// wechselnder Zusammensetzung —, aber alle Kombinationen an einem einzigen
// Ort/Tick zu bilden wäre O(Kandidaten²) und bei großer, an wenigen Orten
// konzentrierter Population unnötig teuer, ohne dass dies für die in docs/07
// festgelegte Semantik erforderlich wäre.
export function runSocialBondingSystem(world: WorldState, _ctx: TickContext): void {
  const socializingByLocation = new Map<number, EntityId[]>();

  for (const entityId of world.entities.alive) {
    const identity = world.components.identity.get(entityId);
    if (!identity || identity.kind !== 'person') continue; // V2-A1-I5: nur Personen

    const aiState = world.components.aiState.get(entityId);
    if (!aiState) continue;
    const activity = aiState.currentActivity;
    if (activity.kind !== 'Performing' || activity.actionId !== 'Socialize') continue;

    const position = world.components.position.get(entityId);
    if (!position) continue;

    const list = socializingByLocation.get(position.locationId) ?? [];
    list.push(entityId);
    socializingByLocation.set(position.locationId, list);
  }

  for (const candidates of socializingByLocation.values()) {
    const sorted = [...candidates].sort((a, b) => a - b);
    for (let i = 0; i + 1 < sorted.length; i += 2) {
      formFriendship(world, sorted[i]!, sorted[i + 1]!);
    }
  }
}

// V2-A1-I2 (Reziprozität), V2-A1-I3 (keine Selbstbeziehung, hier durch i<j
// strukturell ausgeschlossen), V2-A1-I4 (keine Duplikate, hier durch die
// includes()-Prüfung sichergestellt). friendIds bleibt nach jeder Änderung
// aufsteigend nach EntityId sortiert (docs/07 §13, deterministische
// Serialisierung — keine gesonderte Sortierung in serialize.ts nötig).
function formFriendship(world: WorldState, a: EntityId, b: EntityId): void {
  const relA = world.components.relationships.get(a);
  const relB = world.components.relationships.get(b);
  if (!relA || !relB) return;
  if (!relA.friendIds.includes(b)) {
    relA.friendIds.push(b);
    relA.friendIds.sort((x, y) => x - y);
  }
  if (!relB.friendIds.includes(a)) {
    relB.friendIds.push(a);
    relB.friendIds.sort((x, y) => x - y);
  }
}
