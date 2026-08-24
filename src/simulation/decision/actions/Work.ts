import { asActionId, type EntityId } from '../../../domain/value-objects/ids.js';
import { productiveResourceFor, type Building } from '../../../domain/environment.js';
import type { WorldState, WorldStateReader } from '../../../world/WorldState.js';
import type { Action } from '../Action.js';
import { isAdult } from '../../lifeStage.js';

// Work (Subtask 2 §11, Subtask 3 §10 Weltregeln, Subtask 4 Nutzerentscheidung
// "requiredLocation-Mechanismus aktivieren"): 'Field' -> Food, 'Workplace' ->
// Wood (domain/environment.ts productiveResourceFor).
//
// Ursprünglich (03 §10) prüfte canExecute() bereits Anwesenheit. Ein Testlauf
// zeigte, dass dies den in 02 §9 Schritt 4 vorgesehenen Reisemechanismus
// (requiredLocation -> Traveling) für Work/Trade faktisch nie greifen lässt
// — nur bereits-canExecute-fähige Actions werden überhaupt zu "best"
// (03 §9 Schritt 1-3), sodass niemand je "zur Arbeit reist". Ergebnis:
// Personen abseits der Ressourcen-Orte verhungerten (18/20 nach 200 Ticks).
// Nutzerentscheidung: canExecute prüft nur noch grundsätzliche Erreichbarkeit
// (existiert irgendwo ein passendes Gebäude mit Bestand); requiredLocation()
// liefert das Ziel, DecisionSystem löst darüber die Reise aus (02 §9
// Schritt 4, zuvor ungenutzter, aber bereits vorgesehener Pfad).
//
// v2, Subtask 9 §8.3 (V2-I3): zusätzliches Altersgate — Kinder können Work
// nicht ausführen (kein eigenes Einkommen, Versorgung erfolgt über Care).
function isProductiveBuilding(building: Building): boolean {
  const resource = productiveResourceFor(building.kind);
  return resource !== undefined && building.inventory[resource] > 0;
}

function findWorkplaceAt(world: WorldStateReader, locationId: number): Building | undefined {
  return world.environment.buildings.find((b) => b.locationId === locationId && isProductiveBuilding(b));
}

// Deterministische Zielwahl: bleibe am aktuellen Ort, falls dort bereits ein
// passendes Gebäude existiert; sonst — falls die Person eine passende Rolle
// besitzt (v2, Subtask 9 §7/ADR-V2-04) — das niedrigste rollenpassende
// Gebäude; andernfalls die niedrigste BuildingId unter allen erreichbaren
// Kandidaten (einfacher, deterministischer Tie-Break, analog zur
// EntityId-Sortierung an anderer Stelle — keine Pfaddistanz nötig, da
// PathTable nicht Teil von WorldStateReader ist).
function chooseWorkTarget(entityId: EntityId, world: WorldStateReader): Building | undefined {
  const position = world.components.position.get(entityId);
  if (!position) return undefined;
  const here = findWorkplaceAt(world, position.locationId);
  if (here) return here;

  const candidates = world.environment.buildings.filter(isProductiveBuilding).sort((a, b) => a.id - b.id);
  if (candidates.length === 0) return undefined;

  const role = world.components.identity.get(entityId)?.role;
  if (role) {
    const preferredKind = role === 'Farmer' ? 'Field' : 'Workplace';
    const preferred = candidates.find((b) => b.kind === preferredKind);
    if (preferred) return preferred;
  }
  return candidates[0];
}

export function createWorkAction(config: { workTransferPerTick: number; minAdultAgeTicks: number }): Action {
  return {
    id: asActionId('Work'),
    minTicks: 3,

    canExecute(entityId, world) {
      const inventory = world.components.inventory.get(entityId);
      if (!inventory) return false; // nur Person (hat Inventory)
      if (!isAdult(entityId, world, config.minAdultAgeTicks)) return false;
      return chooseWorkTarget(entityId, world) !== undefined;
    },

    // Score sinkt mit dem eigenen Vorrat (Subtask 4, Implementierungsdetail):
    // ein flacher, vorratsunabhängiger Score hätte Personen unabhängig vom
    // tatsächlichen Bedarf ständig zur Arbeit getrieben und dadurch die
    // Kontention an der (einzigen) produktiven Anlage unnötig verschärft.
    // "Komfort-Reserve" = das Dreifache einer Arbeitsschicht — kein neues
    // Config-Feld, rein aus workTransferPerTick abgeleitet.
    score(entityId, world) {
      const target = chooseWorkTarget(entityId, world);
      if (!target) return 0;
      const resource = productiveResourceFor(target.kind)!;
      const inventory = world.components.inventory.get(entityId);
      const currentStock = inventory?.amounts[resource] ?? 0;
      const comfortReserve = config.workTransferPerTick * 3;
      return Math.max(0, 1 - currentStock / comfortReserve) * 0.4;
    },

    requiredLocation(entityId, world) {
      return chooseWorkTarget(entityId, world)?.locationId;
    },

    execute(entityId: EntityId, world: WorldState) {
      const position = world.components.position.get(entityId);
      const inventory = world.components.inventory.get(entityId);
      const workplace = position ? findWorkplaceAt(world, position.locationId) : undefined;
      if (!workplace || !inventory) return { done: true };
      const resource = productiveResourceFor(workplace.kind)!;
      const transferred = Math.min(workplace.inventory[resource], config.workTransferPerTick);
      workplace.inventory[resource] -= transferred;
      inventory.amounts[resource] += transferred;
      // done:true immer (Subtask 4, Bugfix): Work befriedigt kein Need direkt
      // (anders als Eat/Sleep/Socialize) — ohne diese Grenze arbeitet ein
      // Agent unbegrenzt weiter, solange das Gebäude Bestand hat, und kehrt
      // nie zu Idle zurück, um z. B. Eat zu wählen (führte im Testlauf zum
      // Verhungern trotz erreichbarer Nahrung). minTicks (ActionExecutionSystem)
      // sorgt weiterhin für eine Mindestdauer je "Schicht", analog zu Trade.
      return { done: true };
    },
  };
}
