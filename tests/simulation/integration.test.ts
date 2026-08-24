import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { makeTestConfig } from '../helpers/testConfig.js';
import type { EntityId } from '../../src/domain/value-objects/ids.js';

// Subtask 9 §19 / Subtask 10 §4 (Phase A): die drei in 02 §19 wörtlich
// geforderten Integrationstests, die in v1 fehlten (technische Schuld #1).
// Laufen ausschließlich über die echte SimulationEngine.tick()-Schleife,
// rufen keine Systeme direkt auf.

function makeEconomyConfig() {
  const base = makeTestConfig();
  return {
    ...base,
    // Reproduktion ist für diesen Test irrelevant (geprüft wird Produktion/
    // Arbeit/Handel/Konsum, nicht Populationsdynamik) und wird deaktiviert:
    // testConfig.ts' minAdultAgeTicks:10 kombiniert mit
    // birthProbabilityPerEligiblePair:0.5 und ADR-V2-06 (Startpopulation
    // bereits erwachsen) führt über 150 Ticks zu einem unkontrollierten
    // exponentiellen Populationswachstum (empirisch bestätigt: OOM-Absturz
    // nach ~176s) — ein Merkmal dieser Testfixture-Parameterkombination bei
    // dieser Laufzeit, kein v2-Regressionsbefund (dieselbe Reproduktionsregel
    // existierte unverändert bereits in v1).
    reproduction: { ...base.reproduction, birthProbabilityPerEligiblePair: 0 },
    // Explizite Rollen (2 Farmer/2 Holzfäller) + eigener dritter Ort für den
    // Workplace (statt am selben Ort wie das bestehende Field): Work.ts'
    // "bleibe am aktuellen Ort, falls dort bereits ein passendes Gebäude
    // existiert"-Regel (v1-Verhalten, unverändert) hat Vorrang vor der
    // rollenbasierten Zielwahl (ADR-V2-04) — ein Workplace am selben Ort wie
    // das Field würde daher nie angelaufen, weil jede Person, die dorthin
    // reist, das zuerst gefundene (Field-)Gebäude nimmt. Mit eigenem Ort
    // produzieren tatsächlich sowohl Food als auch Wood, was für einen
    // TradeEvent (komplementärer Überschuss) Voraussetzung ist.
    initialPopulation: { ...base.initialPopulation, roles: { farmers: 2, lumberjacks: 2 } },
    worldGraph: {
      locations: [
        {
          ...base.worldGraph.locations[0]!,
          connections: [...base.worldGraph.locations[0]!.connections, { to: 3, travelTicks: 1 }],
        },
        base.worldGraph.locations[1]!,
        { id: 3, name: 'Sägewerk', connections: [{ to: 1, travelTicks: 1 }] },
      ],
      buildings: [...base.worldGraph.buildings, { id: 3, kind: 'Workplace' as const, locationId: 3 }],
    },
  };
}

describe('v1-Integrationstest 1: Agentenlebenszyklus Hunger -> Eat-Entscheidung -> Eat-Ausführung', () => {
  it('DecisionSystem wählt Eat und ActionExecutionSystem führt es tatsächlich aus (über die echte Tick-Schleife)', () => {
    const engine = SimulationEngine.create(makeTestConfig(), new ConsoleLogger('error'));
    const world = engine.getWorld();
    const personId = [...world.entities.alive].find((id) => world.components.identity.get(id)?.kind === 'person')!;
    world.components.needs.get(personId)!.hunger = 20;
    world.components.inventory.get(personId)!.amounts.Food = 50;

    engine.tick();

    const ai = world.components.aiState.get(personId)!;
    expect(ai.currentActivity.kind).toBe('Performing');
    expect(ai.currentActivity.kind === 'Performing' && ai.currentActivity.actionId).toBe('Eat');
    expect(world.components.needs.get(personId)!.hunger).toBeGreaterThan(20);
    expect(world.components.inventory.get(personId)!.amounts.Food).toBeLessThan(50);
  });
});

describe('v1-Integrationstest 2: Wirtschaftskreislauf Produktion -> Arbeit -> Handel -> Konsum', () => {
  it('über mehrere echte Ticks entstehen Harvest-, Trade-Ereignisse und die Population überlebt (Konsum funktioniert)', () => {
    const engine = SimulationEngine.create(makeEconomyConfig(), new ConsoleLogger('error'));
    engine.run(150);
    const world = engine.getWorld();
    const events = world.events.history.toArray();

    expect(events.some((e) => e.type === 'HarvestEvent')).toBe(true); // Produktion
    expect(events.some((e) => e.type === 'TradeEvent')).toBe(true); // Handel
    // Arbeit: mind. eine Person hat irgendwann Food oder Wood durch Work erhalten.
    const anyIncome = [...world.components.inventory.values()].some((inv) => inv.amounts.Food > 0 || inv.amounts.Wood > 0);
    expect(anyIncome).toBe(true);
    // Konsum: Population ist nicht komplett an Hunger zugrunde gegangen.
    expect(world.entities.alive.length).toBeGreaterThan(0);
  });
});

describe('v1-Integrationstest 3: Population Geburt -> Alterung -> Tod durch Verhungern -> Cleanup', () => {
  it('über die echte Tick-Schleife: Geburt unter günstigen Bedingungen, danach Tod durch Verhungern inkl. tatsächlicher Entfernung', () => {
    const config = makeTestConfig({
      reproduction: { minAdultAgeTicks: 10, birthProbabilityPerEligiblePair: 1, crisisThreshold: 30 },
    });
    const engine = SimulationEngine.create(config, new ConsoleLogger('error'));
    const world = engine.getWorld();
    const popBefore = world.entities.alive.length;

    engine.tick(); // günstige Bedingungen (alle initial Erwachsenen, birthProbability=1) -> deterministische Geburt

    expect(world.entities.alive.length).toBeGreaterThan(popBefore);
    const newbornId = [...world.entities.alive].find((id) => world.components.age.get(id)?.ticksAlive === 0)!;
    expect(newbornId).toBeDefined();

    const birthEvent = world.events.history.toArray().find((e) => e.type === 'BirthEvent' && e.entityId === newbornId);
    expect(birthEvent).toBeDefined();

    // Verhungern gezielt herbeiführen: Zähler knapp unter die Schwelle setzen
    // und sicherstellen, dass kein Elternteil Care ausführen kann (kein Food).
    const relationships = world.components.relationships.get(newbornId)!;
    for (const parentId of relationships.parentIds) {
      world.components.inventory.get(parentId as EntityId)!.amounts.Food = 0;
    }
    world.components.needs.get(newbornId)!.hunger = 0;
    world.components.age.get(newbornId)!.ticksAtZeroHunger = config.needs.starvationDeathThresholdTicks - 1;

    engine.tick(); // Schwelle wird in diesem Tick erreicht

    expect(world.components.identity.has(newbornId)).toBe(false); // Cleanup hat entfernt
    expect(world.entities.alive.includes(newbornId)).toBe(false);
    const deathEvent = world.events.history.toArray().find((e) => e.type === 'DeathEvent' && e.entityId === newbornId);
    expect(deathEvent).toBeDefined();
    expect(deathEvent?.type === 'DeathEvent' && deathEvent.cause).toBe('starvation');
  });
});
