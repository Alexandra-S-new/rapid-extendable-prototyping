import { createEntity, markForRemoval } from '../../world/EntityRegistry.js';
import { deriveSeed } from '../../world/rng/deriveSeed.js';
import { IDLE_ACTIVITY } from '../../domain/components/ai-state.js';
import type { PersonNeeds } from '../../domain/components/needs.js';
import type { EntityId, LocationId } from '../../domain/value-objects/ids.js';
import type { WorldState } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';

// PopulationSystem (Subtask 2 §5/§12, Subtask 3.6a, Resolution 1.): Alterung
// und Sterblichkeit gelten generisch für Person+Animal; Fortpflanzung gilt
// ausschließlich für Person (verbindlich). Iteration über einen zu Beginn
// erstellten Snapshot von world.entities.alive, damit neu geborene Entities
// nicht noch im selben Durchlauf mitgezählt werden (Subtask 2 §3/§6).
export function runPopulationSystem(world: WorldState, ctx: TickContext): void {
  const aliveSnapshot = [...world.entities.alive];

  // 1) Alterung + Hunger-Nulldurchlauf-Zähler (generisch Person+Animal).
  for (const entityId of aliveSnapshot) {
    const age = world.components.age.get(entityId);
    const needs = world.components.needs.get(entityId);
    if (!age) continue;
    age.ticksAlive += 1;
    if (needs && needs.hunger <= 0) {
      age.ticksAtZeroHunger += 1;
    } else if (age.ticksAtZeroHunger > 0) {
      age.ticksAtZeroHunger = 0;
    }
  }

  // 2) Fortpflanzung (ausschließlich Person, Subtask 3.6a).
  runReproduction(world, ctx, aliveSnapshot);

  // 3) Sterblichkeit (generisch Person+Animal).
  for (const entityId of aliveSnapshot) {
    const age = world.components.age.get(entityId);
    if (!age) continue;

    if (age.ticksAtZeroHunger >= ctx.config.needs.starvationDeathThresholdTicks) {
      markForRemoval(world, entityId);
      ctx.emit({ type: 'DeathEvent', entityId, cause: 'starvation' });
      continue;
    }

    const maxLifespan = computeMaxLifespan(world.rng.masterSeed, entityId, ctx.config.lifespan.baseMaxLifespanTicks, ctx.config.lifespan.lifespanJitterTicks);
    if (age.ticksAlive >= maxLifespan) {
      markForRemoval(world, entityId);
      ctx.emit({ type: 'DeathEvent', entityId, cause: 'old_age' });
    }
  }
}

function computeMaxLifespan(masterSeed: number, entityId: EntityId, baseMaxLifespanTicks: number, lifespanJitterTicks: number): number {
  if (lifespanJitterTicks === 0) return baseMaxLifespanTicks;
  const hash = deriveSeed(masterSeed, 'lifespan-jitter', entityId);
  const normalized = hash / 0xffffffff; // [0,1)
  const jitter = Math.round((normalized * 2 - 1) * lifespanJitterTicks);
  return baseMaxLifespanTicks + jitter;
}

function isEligibleParent(world: WorldState, ctx: TickContext, entityId: EntityId): boolean {
  const identity = world.components.identity.get(entityId);
  if (!identity || identity.kind !== 'person') return false;
  const age = world.components.age.get(entityId);
  if (!age || age.ticksAlive < ctx.config.reproduction.minAdultAgeTicks) return false;
  const needs = world.components.needs.get(entityId) as PersonNeeds | undefined;
  if (!needs) return false;
  const threshold = ctx.config.reproduction.crisisThreshold;
  return needs.hunger > threshold && needs.energy > threshold && needs.social > threshold;
}

// v2, Subtask 9 §5/ADR-V2-02, präzisiert Subtask 12 (E1, Variante C): eine
// lebende Partnerschaft reserviert beide Seiten für die Ersatz-Paarbildung
// vollständig und bedingungslos — allein anhand `entities.alive`, unabhängig
// vom aktuellen Ort oder der aktuellen Reproduktions-Eligibilität des
// Partners an diesem Tick (V2-I2, Standing-Invariante; V2-I2b: „unverpartnert"
// heißt ausschließlich fehlende oder nicht mehr lebende Referenz). Nur wer
// KEINEN lebenden Partner hat, durchläuft die ursprüngliche sequenzielle
// Paarbildung nach EntityId (03 §12, unverändert für diese Teilmenge).
//
// Subtask-11-Befund (Kategorie A, behoben): die vorherige Fassung prüfte
// zusätzlich `eligibleSet.has(partnerId)` VOR der Reservierungsentscheidung
// selbst — dadurch fiel ein lebender, aber an diesem Tick nicht co-lokal
// eligibler Partner fälschlich in den Ersatz-Pool und konnte durch eine
// dritte Person ersetzt werden (A<->B bestehend, B ortsabwesend, A<->C neu,
// B.partnerId blieb auf A stehen — Verstoß gegen V2-I2 und faktisch eine
// implizite, explizit ausgeschlossene Trennung/Scheidung). Die Reservierung
// (`hasLivingPartner`) und die tatsächliche Paarbildung für diesen Tick
// (zusätzlich `eligibleSet.has(...)`) sind daher jetzt zwei getrennte
// Prüfungen. Kein neuer RNG-Substream (ADR-V2-07), keine Änderung der
// Geburtswahrscheinlichkeit oder Tick-Reihenfolge.
function buildPairs(world: WorldState, eligible: readonly EntityId[], aliveSet: ReadonlySet<EntityId>): [EntityId, EntityId][] {
  const eligibleSet = new Set(eligible);
  const paired = new Set<EntityId>();
  const pairs: [EntityId, EntityId][] = [];

  const hasLivingPartner = new Set<EntityId>();
  for (const entityId of eligible) {
    const partnerId = world.components.relationships.get(entityId)?.partnerId;
    if (partnerId !== undefined && aliveSet.has(partnerId)) {
      hasLivingPartner.add(entityId);
    }
  }

  for (const entityId of eligible) {
    if (paired.has(entityId) || !hasLivingPartner.has(entityId)) continue;
    const partnerId = world.components.relationships.get(entityId)!.partnerId!;
    if (eligibleSet.has(partnerId) && !paired.has(partnerId)) {
      pairs.push([entityId, partnerId]);
      paired.add(entityId);
      paired.add(partnerId);
    }
  }

  const remaining = eligible.filter((id) => !paired.has(id) && !hasLivingPartner.has(id));
  for (let i = 0; i + 1 < remaining.length; i += 2) {
    pairs.push([remaining[i]!, remaining[i + 1]!]);
  }
  return pairs;
}

function isCurrentPartner(world: WorldState, a: EntityId, b: EntityId): boolean {
  return world.components.relationships.get(a)?.partnerId === b;
}

// V2-I2: atomare, wechselseitige Zuweisung.
function formPartnership(world: WorldState, a: EntityId, b: EntityId): void {
  const relA = world.components.relationships.get(a);
  const relB = world.components.relationships.get(b);
  if (relA) relA.partnerId = b;
  if (relB) relB.partnerId = a;
}

function runReproduction(world: WorldState, ctx: TickContext, aliveSnapshot: readonly EntityId[]): void {
  const aliveSet = new Set(world.entities.alive);
  const locations = [...world.environment.locations].sort((a, b) => a.id - b.id);
  const eligibleByLocation = new Map<number, EntityId[]>();

  for (const entityId of aliveSnapshot) {
    if (!isEligibleParent(world, ctx, entityId)) continue;
    const position = world.components.position.get(entityId);
    if (!position) continue;
    const list = eligibleByLocation.get(position.locationId) ?? [];
    list.push(entityId);
    eligibleByLocation.set(position.locationId, list);
  }

  for (const location of locations) {
    const eligible = (eligibleByLocation.get(location.id) ?? []).sort((a, b) => a - b);
    const pairs = buildPairs(world, eligible, aliveSet);

    for (const [parentA, parentB] of pairs) {
      const roll = ctx.rng.stream('reproduction').nextFloat();
      if (roll < ctx.config.reproduction.birthProbabilityPerEligiblePair) {
        const wasNewPairing = !isCurrentPartner(world, parentA, parentB);
        spawnChild(world, ctx, parentA, parentB, location.id);
        if (wasNewPairing) {
          formPartnership(world, parentA, parentB);
        }
      }
    }
  }
}

function spawnChild(world: WorldState, ctx: TickContext, parentA: EntityId, parentB: EntityId, locationId: LocationId): void {
  const childId = createEntity(world);
  world.components.identity.set(childId, { kind: 'person', displayName: `Person-${childId}` });
  world.components.position.set(childId, { locationId });
  const needs: PersonNeeds = { hunger: 100, energy: 100, social: 100 };
  world.components.needs.set(childId, needs);
  world.components.inventory.set(childId, { amounts: { Food: 0, Wood: 0 } });
  world.components.age.set(childId, { ticksAlive: 0, ticksAtZeroHunger: 0 });
  world.components.aiState.set(childId, { currentActivity: IDLE_ACTIVITY });
  world.components.relationships.set(childId, { parentIds: [parentA, parentB], childIds: [], friendIds: [] });

  const relA = world.components.relationships.get(parentA);
  const relB = world.components.relationships.get(parentB);
  relA?.childIds.push(childId);
  relB?.childIds.push(childId);

  ctx.emit({ type: 'BirthEvent', entityId: childId, parentIds: [parentA, parentB] });
}
