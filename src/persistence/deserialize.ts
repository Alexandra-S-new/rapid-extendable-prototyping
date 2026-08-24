import { ValidationError } from '../domain/errors.js';
import { RingBuffer } from '../world/RingBuffer.js';
import { createComponentStores } from '../world/ComponentStores.js';
import type { WorldState } from '../world/WorldState.js';
import type { SimEvent } from '../domain/events.js';
import type { EntityId, LocationId } from '../domain/value-objects/ids.js';
import type { AIState, Relationships } from '../domain/components/index.js';
import type { SaveFile } from './schema.js';

// deserialize (Subtask 3 §7.5, Subtask 2 §13): inkl. Referenzintegritäts-Check
// (zod prüft nur die Form, nicht ob referenzierte IDs existieren).
// parentIds/childIds dürfen auf bereits verstorbene (nicht mehr alive)
// Entities zeigen — bewusst keine Kaskaden-Bereinigung (03 §15) — geprüft
// wird dort nur Plausibilität (< nextEntityId), nicht Lebendigkeit.
export function deserialize(file: SaveFile): WorldState {
  const eventHistoryCapacity = file.config.observability.eventHistoryCapacity;
  const issues: string[] = [];
  const locationIds = new Set(file.world.environment.locations.map((l) => l.id));
  const nextEntityId = file.world.entities.nextEntityId;
  // A1, Subtask 15-17 (V2-A1-I2/I5): friendIds-Reziprozität und
  // Animal-Ausschluss benötigen zusätzlich Lebendigkeits- bzw.
  // Identity-Auskunft — anders als bei parentIds/childIds/partnerId (dort
  // bewusst nur Plausibilität, keine Lebendigkeit, 03 §15).
  const aliveSet = new Set(file.world.entities.alive);
  const identityKindById = new Map(file.world.components.identity.map(([id, identity]) => [id, identity.kind]));
  const relationshipsById = new Map(file.world.components.relationships);

  for (const [entityId, position] of file.world.components.position) {
    if (!locationIds.has(position.locationId)) {
      issues.push(`components.position[${entityId}]: unbekannte LocationId ${position.locationId}`);
    }
  }
  for (const [entityId, relationships] of file.world.components.relationships) {
    for (const parentId of relationships.parentIds) {
      if (parentId < 1 || parentId >= nextEntityId) {
        issues.push(`components.relationships[${entityId}]: unplausible parentId ${parentId}`);
      }
    }
    for (const childId of relationships.childIds) {
      if (childId < 1 || childId >= nextEntityId) {
        issues.push(`components.relationships[${entityId}]: unplausible childId ${childId}`);
      }
    }
    // v2, Subtask 9 §5 (V2-I1): partnerId nur auf Plausibilität geprüft, nicht
    // auf Lebendigkeit — analog zu parentIds/childIds (03 §15).
    if (relationships.partnerId !== undefined && (relationships.partnerId < 1 || relationships.partnerId >= nextEntityId)) {
      issues.push(`components.relationships[${entityId}]: unplausible partnerId ${relationships.partnerId}`);
    }
    // A1 (V2-A1-I1/I3/I4/I5/I2).
    const seenFriendIds = new Set<number>();
    for (const friendId of relationships.friendIds) {
      if (friendId < 1 || friendId >= nextEntityId) {
        issues.push(`components.relationships[${entityId}]: unplausible friendId ${friendId}`);
      }
      if (friendId === entityId) {
        issues.push(`components.relationships[${entityId}]: friendIds enthält Selbstreferenz`);
      }
      if (seenFriendIds.has(friendId)) {
        issues.push(`components.relationships[${entityId}]: friendIds enthält Duplikat ${friendId}`);
      }
      // friendIds ist ausschließlich eine Personen-Personen-Beziehung
      // (V2-A1-I5) — auch die referenzierte Seite darf kein Animal sein.
      if (identityKindById.get(friendId) === 'animal') {
        issues.push(`components.relationships[${entityId}]: friendId ${friendId} referenziert ein Animal`);
      }
      seenFriendIds.add(friendId);
    }
    if (identityKindById.get(entityId) === 'animal' && relationships.friendIds.length > 0) {
      issues.push(`components.relationships[${entityId}]: Animal darf keine friendIds besitzen`);
    }
    // V2-A1-I2: Standing-Reziprozität wird nur zwischen zwei lebenden
    // Entities geprüft (analog dazu, dass partnerId nach dem Tod bewusst
    // nicht kaskadierend bereinigt wird, V2-I2b-Prinzip).
    if (aliveSet.has(entityId as EntityId)) {
      for (const friendId of relationships.friendIds) {
        if (!aliveSet.has(friendId as EntityId)) continue;
        const friendRelationships = relationshipsById.get(friendId);
        if (!friendRelationships || !friendRelationships.friendIds.includes(entityId as EntityId)) {
          issues.push(`components.relationships[${entityId}]: friendId ${friendId} ist nicht reziprok (V2-A1-I2)`);
        }
      }
    }
  }
  for (const building of file.world.environment.buildings) {
    if (!locationIds.has(building.locationId)) {
      issues.push(`environment.buildings[${building.id}]: unbekannte LocationId ${building.locationId}`);
    }
    // v2, Subtask 9 §6 (V2-I5): condition existiert genau dann, wenn
    // kind ∈ {Field, Workplace}.
    const shouldHaveCondition = building.kind === 'Field' || building.kind === 'Workplace';
    if (shouldHaveCondition && building.condition === undefined) {
      issues.push(`environment.buildings[${building.id}]: condition fehlt für kind=${building.kind}`);
    }
    if (!shouldHaveCondition && building.condition !== undefined) {
      issues.push(`environment.buildings[${building.id}]: condition darf für kind=${building.kind} nicht gesetzt sein`);
    }
  }

  if (issues.length > 0) {
    throw new ValidationError('savegame', issues);
  }

  const components = createComponentStores();
  for (const [id, value] of file.world.components.identity) components.identity.set(id as EntityId, value);
  for (const [id, value] of file.world.components.position) components.position.set(id as EntityId, value as { locationId: LocationId });
  for (const [id, value] of file.world.components.needs) components.needs.set(id as EntityId, value);
  for (const [id, value] of file.world.components.inventory) components.inventory.set(id as EntityId, value);
  for (const [id, value] of file.world.components.age) components.age.set(id as EntityId, value);
  for (const [id, value] of file.world.components.aiState) components.aiState.set(id as EntityId, value as AIState);
  for (const [id, value] of file.world.components.relationships) components.relationships.set(id as EntityId, value as Relationships);

  const history = RingBuffer.fromArray<SimEvent>(file.world.events.history as SimEvent[], eventHistoryCapacity);

  return {
    clock: { currentTick: file.world.clock.currentTick },
    rng: { masterSeed: file.world.rng.masterSeed, streamStates: { ...file.world.rng.streamStates } },
    entities: {
      nextEntityId: file.world.entities.nextEntityId as EntityId,
      alive: [...file.world.entities.alive] as EntityId[],
      pendingRemovals: [],
    },
    components,
    environment: {
      season: file.world.environment.season,
      weather: file.world.environment.weather,
      locations: file.world.environment.locations as WorldState['environment']['locations'],
      buildings: file.world.environment.buildings as WorldState['environment']['buildings'],
    },
    events: {
      pending: [],
      history,
      nextSequence: file.world.events.nextSequence,
    },
  };
}
