# Subtask 2 — Architekturbericht: Living World Simulation Engine

> Status: Architekturplanung abgeschlossen. **Kein produktiver Code.**
> Baut verbindlich auf [01-recherche-konzeption.md](./01-recherche-konzeption.md) auf.
> Interface-Skizzen sind konzeptionelles TypeScript-Pseudocode (Typen/Signaturen, keine Implementierungslogik).

Legende: **Erkenntnis** (etabliertes Fachwissen) · **Annahme** (bewusste, revidierbare Setzung) · **Offen** (Subtask 3) · **Korrektur** (widerruft/präzisiert eine Aussage aus Subtask 1, mit Begründung).

---

## 1. Programmiersprache und Runtime — endgültige Entscheidung

### Bewertung

| Kriterium | TypeScript/Node.js | Python | Rust |
|---|---|---|---|
| Statische Typisierung | Vom Compiler erzwungen, inkl. Discriminated Unions für Events/Actions | Optional (mypy), nicht erzwungen | Vom Compiler erzwungen, am strengsten |
| Determinismus | Single-Threaded Event Loop per Default → keine akzidentelle Parallelität; `Math.random()` als einzige echte Falle | Ähnlich einfach, GIL verhindert akzidentelle Parallelität ebenfalls | Volle Kontrolle, aber Nebenläufigkeit muss aktiv vermieden werden (kein Schutz "by default") |
| JSON-Persistenz | Nativ (Objekte ≈ JSON) | Nativ (`dict` ≈ JSON), vergleichbar gut | Braucht Serde + Codegen, mehr Zeremonie |
| Testbarkeit/Tooling | Vitest, sehr schnell, gute Fixture-Ergonomie | pytest, ebenfalls gut | cargo test gut, aber längere Iterationszyklen (Compile-Zeit) |
| Entwicklerproduktivität für ECS-artige Architektur | Gut — strukturelle Typen, Unions passen zu Component/Action-Polymorphie | Gut, aber Typkorrektheit hängt von Disziplin ab | Borrow-Checker reibt sich erfahrungsgemäß stark mit "viele Systeme mutieren denselben WorldState" — braucht Workarounds (`RefCell`, Indizes statt Referenzen) |
| Implementierungsaufwand für ~2000 LOC PoC in angemessener Zeit | Niedrig-mittel | Niedrig | Hoch (Ownership-Modellierung frisst Zeit, die dem PoC-Zweck nicht dient) |
| Standardbibliothek/Tooling für CLI | `node:util.parseArgs` reicht aus | `argparse` reicht aus | `clap` nötig (zusätzliche Dependency) |

### Entscheidung

**TypeScript auf Node.js.** Runtime: **Node.js 22 LTS**, **TypeScript ≥ 5.6**, `strict: true` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, ESM (`"type": "module"`).

**Begründung:**
- Die härteste nichtfunktionale Anforderung aus Subtask 1 ist *erzwungene* statische Typisierung — TypeScripts Compiler erzwingt das, Pythons Typannotationen sind ohne zusätzliche Disziplin (mypy in CI, was selbst wieder eine Tooling-Entscheidung wäre) nur Dokumentation.
- Discriminated Unions (`type SimEvent = {type:'BirthEvent';...} | ...`) sind in TypeScript nativ und passen exakt auf Events, Actions und AIState-Zustände — in Python wären das `dataclass`-Hierarchien mit manuellem `match`, in Rust `enum`s (auch gut geeignet, aber siehe Aufwand).
- JSON-Persistenz ist in JS/TS ohne Übersetzungsschicht möglich (Objekt = JSON), was die Persistenzarchitektur (Abschnitt 13) deutlich vereinfacht.
- Rust böte die stärksten Determinismus-/Performance-Garantien, aber genau diese Stärke (explizite Ownership) kollidiert mit der ECS-lite-Grundidee "viele Systeme lesen/schreiben denselben WorldState" — das ist ein bekanntes Reibungsfeld ("ECS in Rust" braucht i. d. R. spezialisierte Crates oder `unsafe`-Muster). Für einen PoC, der an Architekturklarheit und Lieferbarkeit gemessen wird, steht dieser Mehraufwand in keinem Verhältnis zum Nutzen — Performance ist laut Subtask 1 §8 explizit *kein* Problem bei dieser Zielgröße.
- Python wird verworfen, weil die Typsicherheits-Anforderung sonst nur durch zusätzliche Tooling-Disziplin (mypy strict) erreichbar wäre, die faktisch denselben Aufwand hätte wie TypeScript direkt zu nutzen, ohne dessen Discriminated-Union-Ergonomie.

### Externe Dependencies

| Package | Zweck | Begründung, warum nötig |
|---|---|---|
| `typescript` (dev) | Compiler | Sprachentscheidung |
| `vitest` (dev) | Testframework | Schnell, gute Fixture-Unterstützung, aktiv gepflegt |
| `zod` (runtime) | Schema-Validierung für Config und Savegames | Handgeschriebene, tief verschachtelte Validierung (Abschnitt 13/17) ist fehleranfällig und schwer wartbar; `zod` ist eine reine, seiteneffektfreie Bibliothek ohne eigene Zufalls-/Zeit-Abhängigkeit — beeinträchtigt Determinismus nicht |

Bewusst **keine** weiteren Dependencies:
- **RNG**: selbst implementiert (Abschnitt 8) — volle Kontrolle über Determinismus ist hier wichtiger als Bequemlichkeit einer Bibliothek.
- **CLI-Parsing**: `node:util.parseArgs` (Standardbibliothek) reicht für die in Abschnitt 18 definierten Kommandos.
- Kein Test-Mocking-Framework nötig — Systeme sind pure-ish Funktionen über injizierte `WorldState`/`TickContext`, Fixtures reichen.

---

## 2. Gesamtarchitektur

Schichtenmodell, Abhängigkeitsrichtung strikt nach unten:

```
┌───────────────────────────────────────────────────────────────────┐
│ presentation/  (CLI)                                                │
│   parst argv, ruft application/, formatiert Ausgabe                 │
└──────────────────────────────┬────────────────────────────────────┘
                                ↓ ruft
┌───────────────────────────────────────────────────────────────────┐
│ application/  (SimulationEngine)                                     │
│   besitzt die Tick-Schleife, orchestriert Persistence/Config/Obs.    │
└──────────┬───────────────────┬───────────────────┬──────────────────┬──────────────┘
           ↓ nutzt               ↓ nutzt              ↓ nutzt              ↓ nutzt
┌────────────────┐    ┌────────────────────┐   ┌────────────────────┐  ┌──────────────────┐
│ persistence/    │    │ observability/       │   │ config/              │  │ random/            │
│ save/load,      │    │ Logger, Statistics,  │   │ Schema, Defaults,    │  │ Mulberry32Random-  │
│ Versionierung   │    │ EventHistoryView     │   │ Validierung          │  │ Source (Subt. 3.10)│
└───────┬────────┘    └──────────┬──────────┘   └──────────┬──────────┘  └─────────┬─────────┘
        ↓ liest/schreibt            ↓ liest (nur)             ↓ liefert Typen           ↓ implementiert Port
┌───────────────────────────────────────────────────────────────────┐
│ world/  (WorldState — Single Source of Truth)                       │
│  EntityRegistry · ComponentStores · SimulationClock · Rng            │
│  EnvironmentState (Weather/Season/Locations) · EventQueue/History    │
└──────────────────────────────┬────────────────────────────────────┘
                                ↑ gelesen & mutiert ausschließlich von
┌───────────────────────────────────────────────────────────────────┐
│ simulation/  (Systems, geordnet nach Phase — siehe Abschnitt 5/6)    │
│  systems/ · decision/ (Utility-AI) · economy/ (Market)               │
└──────────────────────────────┬────────────────────────────────────┘
                                ↓ operiert über
┌───────────────────────────────────────────────────────────────────┐
│ domain/  (Components & Value Objects — reine Daten, kein Verhalten)  │
│  Identity, Position, Needs, Inventory, Age, AIState, Relationships   │
└───────────────────────────────────────────────────────────────────┘
```

`simulation/` und `world/` sind eng verzahnt (Systeme mutieren `WorldState` direkt), aber die Abhängigkeitsrichtung ist eindeutig: `simulation/` importiert Typen aus `world/` und `domain/`, niemals umgekehrt. Vollständige Begründung der Schichtgrenzen in Abschnitt 16.

---

## 3. ECS-lite konkretisieren

### Entity

- **ID-Typ**: `type EntityId = number & { readonly __brand: 'EntityId' }` (Branded Type — verhindert Verwechslung mit rohen `number`-Werten zur Compile-Zeit, kostet zur Laufzeit nichts).
- **Vergabe**: fortlaufender Zähler `nextEntityId` in `WorldState.entities`, beginnend bei `1` (`0` ist als "kein Entity"/Null-Referenz reserviert). Vergabe ausschließlich über `EntityRegistry.createEntity()` — nie direkt.
- **Lebenszyklus**: `Alive` → (während eines Ticks) `MarkedForRemoval` (in `pendingRemovals` gesammelt) → tatsächliche Entfernung ausschließlich in der Cleanup-Phase (Begründung: Abschnitt 6). Neu erzeugte Entities (Geburt) existieren ab der Resolution-Phase des aktuellen Ticks in der Registry, nehmen aber **nicht** mehr an Perception/Decision/Action desselben Ticks teil — ihr erster vollständiger Tick ist Tick T+1.
- **ID-Wiederverwendung**: **explizit nein.** IDs sind monoton steigend und werden nie recycelt.
  - **Begründung (Korrektur/Präzisierung ggü. Subtask 1, dort nicht explizit entschieden):** Wiederverwendung würde eine gefährliche Bug-Klasse öffnen — eine veraltete Referenz (z. B. `Relationships.parentIds`, das auf ein verstorbenes Entity zeigt) würde nach Wiederverwendung plötzlich auf ein *anderes, neues* Entity zeigen und Zustand lautlos verfälschen. Ohne Wiederverwendung schlägt ein Lookup auf eine tote ID sichtbar fehl (`SimulationError`) statt lautlos falsches Verhalten zu erzeugen. Speicherkosten sind bei dieser Zielgröße irrelevant.

### Components

Reine Daten, **kein** Verhalten — jede Mutation geschieht ausschließlich in Systemen (Abschnitt 5).

| Component | Zweck | Kerndaten | Lesen | Schreiben | Persistiert |
|---|---|---|---|---|---|
| `Identity` | Art des Entities, unveränderlich nach Erzeugung | `{ kind: 'person'\|'animal', species?, displayName }` | alle | nur Erzeugung (Population/Weltinit) | ja |
| `Position` | Aktueller/zuletzt verlassener Ort | `{ locationId }` (Subtask 7: konsolidiert — der Reisezustand selbst liegt vollständig in `AIState.currentActivity` (`Traveling`), s. u.; keine Duplikation) | Decision, Economy, Observability | `MovementSystem` | ja |
| `Needs` | Bedürfniswerte 0–100 | Person: `{ hunger, energy, social }`; Animal: `{ hunger, energy }` (Subtask 3.6b) | Decision, Observability | `NeedsSystem` (Zerfall), Actions via `ActionExecutionSystem` (Befriedigung) | ja |
| `Inventory` | Ressourcenbestand | `{ amounts: Record<ResourceType, number> }` | Decision (Afford-Check), Observability | Actions (Work/Trade) via `ActionExecutionSystem` | ja |
| `Age` | Lebensalter in Ticks | `{ ticksAlive, ticksAtZeroHunger }` (Subtask 7: `ticksAtZeroHunger` ergänzt — notwendiger historischer Zustand für die Starvation-Regel aus 03 §10, nicht aus einem Snapshot ableitbar, daher keine verbotene rein abgeleitete Zwischenspeicherung; LifeStage bleibt weiterhin abgeleitet, nicht gespeichert) | Decision, Population | `PopulationSystem` | ja |
| `AIState` | FSM-Ausführungszustand der Utility-AI | `{ currentActivity: Idle \| Traveling{...} \| Performing{actionId, ticksInAction} }` | Decision, Movement, ActionExecution | `DecisionSystem`, `MovementSystem`, `ActionExecutionSystem` | ja |
| `Relationships` | Minimaler Sozialgraph (nur Eltern/Kinder) | `{ parentIds: EntityId[], childIds: EntityId[] }` | Population, Observability | `PopulationSystem` | ja |

**Verbindliche Präzisierung (Subtask 3.6b):** `Needs` hat je nach `Identity.kind` einen anderen Umfang — Person besitzt `hunger`, `energy` **und** `social`; Animal besitzt nur `hunger` und `energy`. Begründung: Subtask 1 §3.1 fordert für Tiere ausdrücklich ein "reduziertes Bedürfnis-Set" (ohne festzulegen, welches Bedürfnis konkret entfällt); Animal besitzt bereits keine `Inventory`-vermittelte Interaktionsebene (kein Work/Trade), sodass ein `social`-Bedürfnis ohne eine für Animal verfügbare, es befriedigende Handlung dem bereits etablierten Prinzip widerspräche, keine ungenutzten Felder zu führen (s. u., "Bewusst verworfen"). `NeedsSystem` wendet den Zerfall (`config.needs.*DecayPerTick`) nur auf die bei der jeweiligen Entity tatsächlich vorhandenen Needs-Felder an; `socialDecayPerTick` gilt ausschließlich für Person. Jede Action, die ausschließlich auf `social` scort (`Socialize`), liefert für Animal `canExecute() === false` — es wird keine künstliche Animal-Ausprägung für `social` eingeführt.

**Bewusst verworfen:** ein eigenes `Health`- oder `Species`-Component. Tod wird aus `Needs`+`Age` abgeleitet statt in einer eigenen Komponente gespiegelt; `species` ist ein Feld von `Identity` statt einer eigenen Komponente, da es sonst eine Komponente mit genau einem Feld für nur einen Entity-Typ wäre — unnötige Fragmentierung.

**Alles wird persistiert.** Es gibt keine rein zwischengespeicherten/abgeleiteten Werte in Component Stores (z. B. `lifeStage`) — Ableitungen passieren beim Lesen, nie beim Schreiben, um Persistiert-vs-abgeleitet-Divergenz strukturell auszuschließen.

---

## 4. WorldState

```ts
interface WorldState {
  clock: { currentTick: number }
  rng: { masterSeed: number; streamStates: Record<string, number> }
  entities: {
    nextEntityId: EntityId
    alive: EntityId[]            // sortiert gehalten
    pendingRemovals: EntityId[]  // während des Ticks gesammelt, in Cleanup verarbeitet
  }
  components: {
    identity: Map<EntityId, Identity>
    position: Map<EntityId, Position>
    needs: Map<EntityId, Needs>
    inventory: Map<EntityId, Inventory>
    age: Map<EntityId, Age>
    aiState: Map<EntityId, AIState>
    relationships: Map<EntityId, Relationships>
  }
  environment: {
    season: Season
    weather: Weather
    locations: Location[]          // statischer Graph, siehe Abschnitt 10
    buildings: Building[]
  }
  events: {
    pending: SimEvent[]            // während des Ticks gesammelt
    history: RingBuffer<SimEvent>  // begrenzt, siehe Abschnitt 7/14
    nextSequence: number           // Subtask 3.9 — nächster zu vergebender sequence-Wert, unabhängig von der (begrenzten) history
  }
}
```

### Mutationsregeln

1. **Während eine Simulation läuft**, darf `WorldState` ausschließlich von dem gerade ausgeführten System der aktuellen Phase mutiert werden — und nur an den für dieses System dokumentierten Komponenten (Abschnitt 5).
2. Entity-Erzeugung/-Entfernung läuft ausschließlich über `EntityRegistry`-Methoden (`createEntity`, `markForRemoval`, `commitRemovals`) — nie über direkte `Map`/Array-Manipulation, damit Registry und Component Stores nicht auseinanderlaufen.
3. Globale Daten (`clock`, `rng`, `environment`) werden ausschließlich von ihren dedizierten Systemen verändert (`TimeSystem`, `WeatherSystem`, `ProductionSystem` für Building-Inventare).
4. **Die einzigen legitimen Mutationen außerhalb der Tick-Schleife** sind (a) Welterzeugung/Seeding beim Start und (b) das vollständige Ersetzen von `WorldState` beim Laden eines Spielstands (construct-then-swap, nie in-place, siehe Abschnitt 13). CLI/`application/` fassen `WorldState` sonst nie direkt an.
5. Beobachtende Module (`observability/`) dürfen `WorldState` **nur lesen**, nie schreiben — strukturell erzwungen dadurch, dass sie ausschließlich Read-only-Views/Kopien erhalten (kein `WorldState`-Referenz-Durchgriff mit Schreibrechten).

Damit existiert kein versteckter Mutable State außerhalb dieser einen Struktur.

---

## 5. Systemarchitektur

Zehn Systeme, jedes mit exakt dokumentiertem Vertrag. `TickContext` (nicht separat aufgeführt) enthält `{ config, logger, emit(event) }` und wird jedem System zusätzlich zu `WorldState` übergeben.

### Perception

**TimeSystem**
1. Zweck: leitet Tag/Jahreszeit aus `clock.currentTick` ab, erkennt Jahreszeitenwechsel.
2. Input: `WorldState.clock`, `config.ticksPerDay/daysPerSeason`.
3. Liest: `clock`.
4. Schreibt: `environment.season`.
5. Events: `SeasonChangedEvent` (nur bei Wechsel).
6. Konsumiert: keine.
7. Phase: Perception (1.).
8. Abhängigkeiten: keine (läuft zuerst).
9. Determinismus-Risiko: keins (reine Arithmetik über den Tick-Zähler).

**WeatherSystem**
1. Zweck: würfelt neues Wetter, beeinflusst von Jahreszeit.
2. Input: `environment.season`, `rng.stream('weather')`.
3. Liest: `environment.season`.
4. Schreibt: `environment.weather`.
5. Events: `WeatherChangedEvent` (nur bei Änderung).
6. Konsumiert: keine.
7. Phase: Perception (2.).
8. Abhängigkeiten: nach `TimeSystem`.
9. Determinismus-Risiko: muss zwingend den benannten Substream `weather` nutzen, nie einen globalen RNG.

**ProductionSystem**
1. Zweck: passive Ressourcenerzeugung produktiver Gebäude (Feld → Food, Wald → Wood), skaliert mit Jahreszeit/Wetter.
2. Input: `environment.buildings`, `environment.season/weather`, `rng.stream('production')`, `config.economy.productionBaseRate`.
3. Liest: `environment.buildings`, `environment.season`, `environment.weather`.
4. Schreibt: `Building.inventory` (Subtask 3.13: Terminologie an die Building-Korrektur angepasst).
5. Events: `HarvestEvent`.
6. Konsumiert: keine.
7. Phase: Perception (3.).
8. Abhängigkeiten: nach `WeatherSystem`.
9. Determinismus-Risiko: nutzt eigenen Substream `production` für Ertragsvarianz; Iteration über Gebäude in fester (ID-)Reihenfolge.

**NeedsSystem**
1. Zweck: Bedürfnis-Zerfall pro Tick.
2. Input: `Needs`, `config.needs.*DecayPerTick`.
3. Liest: `Needs`.
4. Schreibt: `Needs` (Zerfall, geklemmt auf [0,100]).
5. Events: keine.
6. Konsumiert: keine.
7. Phase: Perception (4.).
8. Abhängigkeiten: nach `ProductionSystem` (Reihenfolge hier nicht fachlich zwingend, aber fixiert).
9. Determinismus-Risiko: keins (reine Arithmetik); Iteration zwingend nach `EntityId` sortiert.

### Decision

**DecisionSystem**
1. Zweck: wählt für jeden entscheidungsbereiten Agenten (`AIState.currentActivity.kind === 'Idle'`) die nächste Aktivität via Utility-AI (Details Abschnitt 9).
2. Input: `Needs`, `Position`, `Inventory`, `Age`, `AIState`, `environment`, `rng.stream('agent-decision', entityId)`.
3. Liest: `Needs`, `Position`, `Inventory`, `Age`, `AIState`, `environment` (Subtask 3.13: mit Input-Zeile synchronisiert).
4. Schreibt: `AIState`.
5. Events: keine (Wirkungen entstehen erst bei Ausführung).
6. Konsumiert: keine.
7. Phase: Decision.
8. Abhängigkeiten: nach vollständiger Perception-Phase (braucht frische Werte).
9. Determinismus-Risiko: **hoch** — Iteration zwingend nach `EntityId` sortiert; Tie-Break bei gleichem Score ausschließlich über den agenteneigenen RNG-Substream, nie über Einfüge-/Objektreihenfolge; Mindestdauer (Hysterese) ist zwingend, sonst Oszillationsrisiko (siehe Subtask 1 §5.1).

### Action

**MovementSystem**
1. Zweck: bewegt reisende Agenten entlang des vorab berechneten Pfades.
2. Input: `Position.travel`, `AIState`.
3. Liest: `Position`, `AIState`.
4. Schreibt: `Position`, `AIState` (Übergang aus `Traveling` bei Ankunft).
5. Events: `MovementEvent` (bei Ankunft).
6. Konsumiert: keine.
7. Phase: Action (1.).
8. Abhängigkeiten: nach `DecisionSystem`.
9. Determinismus-Risiko: gering (reine Zustandsmaschine); Iteration sortiert.

**ActionExecutionSystem**
1. Zweck: generischer Dispatcher — ruft für jeden nicht reisenden, `Performing`-Agenten `action.execute(entityId, world, rng)` der aktuell gewählten `Action` auf (siehe Abschnitt 9). Kennt die fachliche Wirkung einzelner Actions **nicht** selbst.
2. Input: `AIState.currentActivity`, agentenspezifischer `rng.stream('agent-action', entityId)` (eigener Stream, getrennt von `DecisionSystem`s `agent-decision` — Subtask 3.7).
3. Liest: `AIState` (welche Action, wie lange schon aktiv); alle weiteren Lese-/Schreibzugriffe erfolgen *innerhalb* der jeweiligen `Action`-Implementierung (dort dokumentiert, nicht hier — siehe Abschnitt 9).
4. Schreibt: `AIState.currentActivity.ticksInAction`, Übergang zu `Idle` bei Abschluss.
5. Events: abhängig von der ausgeführten Action (z. B. `TradeEvent`, keine feste Liste hier).
6. Konsumiert: keine.
7. Phase: Action (2.).
8. Abhängigkeiten: nach `MovementSystem` (nur nicht-reisende Agenten werden behandelt).
9. Determinismus-Risiko: `done`-Abschluss wird erst ab `ticksInAction >= action.minTicks` honoriert (Hysterese); Iteration sortiert.

### Resolution

**PopulationSystem**
1. Zweck: Alterung, Fortpflanzung, Sterblichkeit.
2. Input: `Age`, `Needs`, `Position`, `Relationships`, `rng.stream('reproduction')`, `config.reproduction/lifespan`.
3. Liest: `Age`, `Needs`, `Position`, `Relationships`.
4. Schreibt: `Age` (Inkrement), `Relationships`, `entities` (Erzeugung via `createEntity`, Markierung via `markForRemoval`).
5. Events: `BirthEvent`, `DeathEvent`.
6. Konsumiert: keine.
7. Phase: Resolution (1.).
8. Abhängigkeiten: nach abgeschlossener Action-Phase (braucht die *finalen* Bedürfniswerte des Ticks, sonst würde ein Agent, der in diesem Tick gerade noch gegessen hat, fälschlich als verhungert markiert).
9. Determinismus-Risiko: Paarung eligibler Personen erfolgt pro Ort in sortierter ID-Reihenfolge (sequenziell 0&1, 2&3, …), nicht über alle Kombinationen (vermeidet O(n²) und Nichtdeterminismus durch Paar-Auswahlreihenfolge); Lebensspanne wird **nicht** aus einem konsumierten RNG-Wert gezogen, sondern als reine Funktion `jitter(masterSeed, entityId)` berechnet — dadurch kein "wann genau wird der Zufallswert gezogen"-Risiko.

**EventResolutionSystem**
1. Zweck: überführt die während des Ticks gesammelten Events in die begrenzte `EventHistory`.
2. Input: `events.pending`.
3. Liest: `events.pending`.
4. Schreibt: `events.history` (Append), leert `events.pending`.
5. Events: erzeugt keine neuen.
6. Konsumiert: alle in diesem Tick emittierten Events (append-only, **keine** verketteten Reaktions-Handler — siehe ADR 6/Korrektur).
7. Phase: Resolution (2., letztes Domänensystem).
8. Abhängigkeiten: nach `PopulationSystem`.
9. Determinismus-Risiko: gering — Anhängereihenfolge entspricht per Konstruktion der Emissionsreihenfolge (feste Systemreihenfolge während des Ticks).

### Cleanup

**CleanupSystem**
1. Zweck: entfernt als tot markierte Entities endgültig aus Registry und allen Component Stores.
2. Input: `entities.pendingRemovals`.
3. Liest: `entities.pendingRemovals`.
4. Schreibt: `entities.alive`, alle `components.*`-Maps (Löschung).
5. Events: keine (Tod wurde bereits in `PopulationSystem` gemeldet — der Zeitpunkt der *Feststellung*, nicht der mechanischen Entfernung, ist das Event-relevante Ereignis).
6. Konsumiert: keine.
7. Phase: Cleanup (letzte Phase, letztes System).
8. Abhängigkeiten: absolut letztes System des Ticks.
9. Determinismus-Risiko: keins bei sortierter Verarbeitung von `pendingRemovals`.

**Bewusst kein separates `EconomySystem`:** Handel (`Trade`) und Arbeit (`Work`) sind als `Action`-Implementierungen modelliert, die vom generischen `ActionExecutionSystem` aufgerufen werden (siehe Abschnitt 9/11) — das vermeidet ein zusätzliches System nur für zwei Handlungsarten und hält die Erweiterbarkeitsregel "neue Handlung = neue Action-Datei, kein bestehendes System ändern" konsistent.

---

## 6. Phasenmodell und Systemreihenfolge

```
tick():
  worldState.clock.currentTick += 1        // Engine-Infrastruktur, kein System

  Perception:  TimeSystem → WeatherSystem → ProductionSystem → NeedsSystem
  Decision:    DecisionSystem
  Action:      MovementSystem → ActionExecutionSystem
  Resolution:  PopulationSystem → EventResolutionSystem
  Cleanup:     CleanupSystem
```

**Begründung der Reihenfolge:**

- *Perception vor Decision*: Agenten entscheiden auf Basis der in diesem Tick aktualisierten Umwelt- und Bedürfniswerte, nicht auf einen Tick veralteten Daten — eine bewusste, dokumentierte Wahl (die Alternative "auf Vortageswerten entscheiden" wäre ebenso deterministisch, aber weniger intuitiv).
- *Decision vor Action*: eine Handlung muss gewählt sein, bevor sie ausgeführt werden kann — im selben Tick.
- *Action vor Resolution*: Sterblichkeit/Fortpflanzung müssen auf den *tatsächlichen* Auswirkungen dieses Ticks basieren (ein Agent, der gerade noch gegessen hat, darf nicht mit dem Hungerwert *vor* dem Essen als verhungert gelten).
- *Resolution vor Cleanup*: ein Tod muss geloggt/im Event festgehalten sein, bevor das Entity mechanisch entfernt wird — sonst könnten andere, gleichzeitig laufende Teile fälschlich auf ein bereits "halb entferntes" Entity zugreifen.
- **Neugeborene** entstehen in Resolution und nehmen frühestens ab Tick T+1 an Perception/Decision/Action teil (Abschnitt 3) — vermeidet Ambiguität ("zählt der Bedürfniszerfall am Geburtstick?").
- **Verstorbene** werden in Resolution markiert, aber erst in Cleanup entfernt — Zwei-Phasen-Lebenszyklus, der verhindert, dass die Entfernungsreihenfolge innerhalb eines Ticks das Ergebnis anderer, noch laufender Systeme beeinflusst.

---

## 7. Event-System

```ts
type SimEvent =
  | { type: 'BirthEvent'; sequence: number; tick: number; entityId: EntityId; parentIds: EntityId[] }
  | { type: 'DeathEvent'; sequence: number; tick: number; entityId: EntityId; cause: 'starvation' | 'old_age' }
  | { type: 'TradeEvent'; sequence: number; tick: number; buyer: EntityId; seller: EntityId; resource: ResourceType; amount: number; price: number }
  | { type: 'HarvestEvent'; sequence: number; tick: number; buildingId: BuildingId; resource: ResourceType; amount: number }
  | { type: 'MovementEvent'; sequence: number; tick: number; entityId: EntityId; fromLocation: LocationId; toLocation: LocationId }
  | { type: 'SeasonChangedEvent'; sequence: number; tick: number; season: Season }
  | { type: 'WeatherChangedEvent'; sequence: number; tick: number; weather: Weather }
```

- `sequence`: global monoton steigender Zähler, nützlich für Inspektion ("zeig Event #452") — bewusst hinzugefügt über die reine Notwendigkeit hinaus, aber mit vernachlässigbaren Kosten und klarem Beobachtbarkeits-Nutzen. **Speicherort (Subtask 3.9, verbindlich):** `worldState.events.nextSequence` — der nächste zu vergebende Wert, geführt analog zu `entities.nextEntityId` (Abschnitt 4), unabhängig von der begrenzten `history` (deren Kapazität und etwaige Verdrängung alter Events beeinflussen `nextSequence` nicht).
- Emission: Systeme rufen `ctx.emit(event)` — ein Helper, der `tick` sowie `sequence` (aus `worldState.events.nextSequence`) setzt, `nextSequence` anschließend inkrementiert und das Event an `worldState.events.pending` anhängt.
- Verarbeitung: **ausschließlich** `EventResolutionSystem` liest `pending`, hängt an `history` an (begrenzter Ringpuffer, Kapazität aus Config, siehe Abschnitt 14) und leert `pending`.

**Korrektur ggü. Subtask 1:** Subtask 1 sprach allgemein von einem "Event Bus"; hier wird das bewusst auf einen **rein additiven, unidirektionalen Mechanismus** präzisiert — es gibt **keine** registrierten Subscriber/verketteten Reaktions-Handler (kein System reagiert auf ein Event eines anderen Systems *im selben Tick*). Jede fachliche Wirkung, die früher "durch ein Event ausgelöst" hätte werden können, geschieht stattdessen direkt im auslösenden System (z. B. löst `PopulationSystem` selbst die Entity-Erzeugung aus, statt einen `BirthEvent`-Handler dafür zu benötigen). **Begründung:** ein generischer Pub-Sub-Dispatcher mit Subscriber-Verwaltung ist für die im PoC benötigten Events unnötige Komplexität (Subtask 1 §7 fordert Event-History/Beobachtbarkeit, nicht Reaktionsketten) und wäre eine zusätzliche, nicht geforderte Determinismus-Fehlerquelle (Reihenfolge der Subscriber-Aufrufe). Sollte ein späterer Subtask tatsächlich Event-getriebene Sekundärreaktionen brauchen (z. B. "Krankheit breitet sich bei `MovementEvent` aus"), ist das eine explizite, lokal begründete Erweiterung des Event-Konsums, kein Bruch dieser Architektur.

Alle Events landen (innerhalb der konfigurierten Kapazität) in der persistenten `history` — es gibt keine Unterscheidung "nur intern verarbeitet" vs. "historisiert"; die Begrenzung ist ausschließlich eine Frage der Rückschau-Tiefe (siehe Abschnitt 14), nicht der Vollständigkeit pro Event-Typ.

---

## 8. Deterministische RNG-Architektur

```ts
interface RandomSource {   // Subtask 3.13: vereinheitlicht mit Subtask 3 §7.5 (vormals hier DeterministicRng benannt)
  nextFloat(): number        // [0, 1)
  nextInt(maxExclusive: number): number
  getState(): number         // für Persistenz — Subtask 3.12: bewusst Bestandteil des Ports, s. u.
}
```

- **Algorithmus**: `mulberry32` (32-Bit-State, ein Multiply-XOR-Shift-Schritt) — bewusst selbst implementiert statt einer Bibliothek: ausreichende statistische Qualität für Simulationszwecke (keine Kryptographie nötig), minimaler Code (~10 Zeilen), vollständige Kontrolle über Persistenz des internen Zustands.
- **Modulplatzierung (Subtask 3.10, verbindlich):** das Interface ist ein Domain-Port und liegt in `world/ports.ts`, konsistent mit `Logger`. Die konkrete `mulberry32`-Implementierung ist Infrastructure (Subtask 3 §8) und liegt in `random/Mulberry32RandomSource.ts` — nicht mehr in `world/rng/`, das nur noch die Substream-Orchestrierung (Seed-Ableitung, benannte Streams, s. u.) enthält. Details: Abschnitt 16.
- **`getState()` und Persistenz (Subtask 3.12, verbindlich):** `getState()` ist eine legitime Fähigkeit des Domain-Ports, keine Verletzung der Domain-/Infrastructure-Grenze — sie liefert einen opaken `number`, keine Algorithmus-Interna. Die Substream-Orchestrierung in `world/rng/` ruft nach jeder Verwendung eines Streams `getState()` auf der zurückgegebenen Instanz auf und schreibt den Wert in `worldState.rng.streamStates[name]` zurück. Das ist der konkrete, zuvor unspezifizierte Mechanismus, mit dem der unten beschriebene Persistenzvertrag ("jeder Substream wird mit seinem aktuellen Zustand gespeichert") tatsächlich erfüllt wird.
- **Seed-Ableitung für Substreams**: `deriveSeed(masterSeed, ...keyParts): number` — FNV-1a-Hash über `masterSeed + ':' + keyParts.join(':')`, erzeugt einen neuen unabhängigen `mulberry32`-Zustand.
- **Verwendung**:
  - Systemweite Streams: `rng.stream('weather')`, `rng.stream('production')`, `rng.stream('reproduction')`.
  - Pro-Agent-Streams: `rng.stream('agent-decision', entityId)` (Tie-Break bei der Aktionsauswahl, `DecisionSystem`) und `rng.stream('agent-action', entityId)` (Zufallsbedarf während der Ausführung, `ActionExecutionSystem`/`Action.execute()`) — zwei getrennte Streams pro Agent, je einer pro System, stabil über die Lebenszeit des Agenten, unabhängig von anderen Agenten oder Systemen.

**Verbindliche Präzisierung (Subtask 3.7):** `DecisionSystem` und `ActionExecutionSystem` sind zwei eigenständige Systeme im Sinne von Regel 3 unten und erhalten daher je einen eigenen, eindeutig benannten Stream statt sich `agent-decision` zu teilen. Begründung: Ein gemeinsamer Stream bliebe zwar deterministisch (gleicher Seed → gleicher Ablauf bleibt erhalten), hätte aber schlechtere Isolation — eine zusätzliche Zufallsziehung innerhalb von `ActionExecutionSystem` (z. B. durch eine künftige Action) würde die von `DecisionSystem` für dieselbe Entity in späteren Ticks gezogene Tie-Break-Sequenz verschieben, exakt die von Regel 3 verhinderte Situation, nur auf Ebene einer einzelnen Entity statt global. Diese Trennung ändert nichts an Seed, Substream-Prinzip oder deterministischer Iterationsreihenfolge.
- **Lazy-Erzeugung**: ein Substream existiert (und wird in `streamStates` persistiert) erst, nachdem er tatsächlich zum ersten Mal gezogen wurde — kein vorab zu pflegendes globales Register aller möglichen Streams.
- **Persistenz**: `RngState = { masterSeed, streamStates: Record<string, number> }` — jeder je verwendete Substream wird mit seinem *aktuellen* internen Zustand gespeichert, nicht nur mit seinem Ableitungsschlüssel, da er inzwischen weitergelaufen ist (Subtask 1 §5.4 Punkt 5).

**Verbindliche Implementierungsregeln:**

1. `Math.random()` ist in `domain/`, `world/`, `simulation/` verboten (Lint-Regel, statische Disziplin, kein Laufzeit-Check nötig).
2. Jedes System/jede Action, die Zufall braucht, deklariert den/die verwendeten Substream(s) in ihrer Dokumentation (Abschnitt 5) und bezieht ihn ausschließlich über `worldState.rng.stream(name, ...keyParts)` — nie durch Halten eines rohen Generators über Ticks hinweg außerhalb von `WorldState`.
3. **Ein neues System/Feature bekommt immer einen neuen, eindeutig benannten Stream** — niemals Wiederverwendung eines bestehenden Schlüssels oder Ziehen aus einem "allgemeinen" Stream. Das ist die konkrete technische Umsetzung der in Subtask 1 geforderten Eigenschaft, dass Erweiterungen bestehende Zufallsfolgen nicht verschieben dürfen.
4. Iteration, die RNG-Verbrauch beeinflusst (z. B. welcher Agent zuerst entscheidet), erfolgt immer in der gleichen, nach `EntityId` sortierten Reihenfolge — kombiniert mit Pro-Agent-Streams ist Agenten-Zufall dadurch sogar unabhängig von der *Anwesenheit anderer* Agenten, nicht nur von anderen Systemen.

---

## 9. Utility-AI

```ts
interface Action {
  readonly id: ActionId
  readonly minTicks: number                                            // Hysterese
  canExecute(entityId: EntityId, world: WorldStateReader): boolean      // pure
  score(entityId: EntityId, world: WorldStateReader): number            // pure, deterministisch, KEIN RNG
  requiredLocation?(entityId: EntityId, world: WorldStateReader): LocationId | undefined
  execute(entityId: EntityId, world: WorldState, rng: RandomSource): { done: boolean; events?: EmittedEvent[] }
}
```
(Subtask 3.13: synchronisiert mit der in Subtask 3 §7.2 bereits präzisierten Fassung — `canExecute`/`score` erhalten nur die Lesesicht `WorldStateReader`, nicht das volle mutierbare `WorldState`; `execute` erhält weiterhin Schreibzugriff und den `RandomSource`-Port. **Konsolidiert, Subtask 7:** `requiredLocation` — genutzt von `Work`/`Trade` (ADR-14, s. u.) — und die `events?`-Erweiterung von `execute()` — `ActionExecutionSystem` leitet zurückgegebene Events generisch an `ctx.emit()` weiter, ohne ihre fachliche Bedeutung zu kennen — sind Teil der verbindlichen v1-Fassung dieses Interfaces, nicht nur eine Implementierungsdetail-Ergänzung.)

**Auswahlalgorithmus (`DecisionSystem`)**, pro entscheidungsbereitem Agenten (nur `AIState.currentActivity.kind === 'Idle'`), Agenten sortiert nach `EntityId`:

1. `candidates = actions.filter(a => a.canExecute(agent, world))`.
2. `scored = candidates.map(a => [a, a.score(agent, world)])` — rein, deterministisch, ohne Zufall.
3. `best = max(scored)`; bei **exaktem Gleichstand** mehrerer Kandidaten: Tie-Break über `rng.stream('agent-decision', entityId).nextInt(n)` auf die (nach `ActionId` sortierten) gleichauf liegenden Kandidaten — garantiert Determinismus auch bei Punktgleichheit.
4. Erfordert die Action einen anderen Ort (`requiredLocation`), wird zunächst eine `Traveling`-Reise dorthin gesetzt (Abschnitt 10); die eigentliche Action wird erst nach Ankunft neu entschieden. Andernfalls: `AIState.currentActivity = Performing{actionId, ticksInAction: 0}`.

**Ausführung (`ActionExecutionSystem`)**: ruft pro Tick `action.execute(...)` auf; die Aktion ist erst abschlussfähig (`done` wird honoriert), wenn `ticksInAction >= action.minTicks` — das ist die Hysterese, die Oszillation zwischen knapp beieinanderliegenden Scores verhindert (Subtask 1 §5.1, Risikoregister Abschnitt 22). Ein Agent wird frühestens im **nächsten** Tick nach Abschluss wieder `Idle` und damit erneut entscheidungsfähig — dokumentierte, harmlose Ein-Tick-Latenz.

**Konkrete Actions** (in `simulation/decision/actions/`): `Eat`, `Sleep`, `Socialize`, `Work`, `Trade` — jede eine eigene Datei/Implementierung; neue Handlungen (z. B. `Craft`) werden als neue Datei hinzugefügt, ohne `DecisionSystem` oder `ActionExecutionSystem` zu ändern (Open/Closed Principle konkret angewandt).

**Korrektur (Subtask 4, ADR-14):** `Work` und `Trade` prüfen in `canExecute()` **nicht** mehr exakte Anwesenheit am Zielgebäude, sondern nur grundsätzliche Erreichbarkeit (existiert irgendwo ein passendes, nutzbares Gebäude). Den Zielort liefert `requiredLocation()`. Begründung: In der ursprünglichen Fassung prüfte `canExecute()` bereits `Position.locationId === Building.locationId` (vormals Abschnitt 11) — dadurch konnte Schritt 4 dieses Algorithmus für Work/Trade nie greifen, da nur bereits-`canExecute`-fähige Actions als `best` gewählt werden (Schritt 1–3): eine Action, die erst nach Ankunft ausführbar wäre, wurde nie als "beste, noch zu erreichende" Action ausgewählt. Personen abseits eines produktiven Gebäudes bekamen dadurch nie Ressourcen ins Inventar (siehe Subtask-4-Bericht: 18 von 20 Personen verhungerten in einem Testlauf über 200 Ticks). Die Korrektur aktiviert den in Schritt 4 bereits vorgesehenen, bis dahin unerreichbaren Reisemechanismus: Anwesenheit bleibt weiterhin **Ausführungsvoraussetzung** (`execute()` prüft sie unverändert), ist aber keine **Auswahlvoraussetzung** mehr. Keine neuen Systeme/Interfaces/Zustände — `requiredLocation` existierte bereits im Action-Interface (Abschnitt 9 dieses Dokuments, konkretisiert in Subtask 3 §7.2).

**Testbarkeit**: `canExecute`/`score` sind reine Funktionen über `(EntityId, WorldStateReader)` → mit einer minimalen, handgebauten `WorldState`-Fixture ohne laufende Engine testbar. `execute` benötigt zusätzlich eine `RandomSource`-Instanz, bleibt aber isoliert testbar.

---

## 10. Orte und Bewegung

```ts
interface Location {
  id: LocationId
  name: string
  connections: { to: LocationId; travelTicks: number }[]
  capacity?: number          // Datenmodell vorhanden, in v1 NICHT durchgesetzt (siehe unten)
  buildingIds: BuildingId[]  // korrigiert von EntityId[] — Subtask 3.8, konsistent mit der BuildingId-Entscheidung aus Subtask 3 §3.1
}
```

- Der Orts-Graph ist **statisch**, definiert in der Config (Abschnitt 17), nicht prozedural generiert und zur Laufzeit nicht erweiterbar (kein dynamischer Gebäudebau in v1 — bewusste Scope-Grenze).
- **Kein generisches Pathfinding-System.** Stattdessen: bei Welterzeugung wird **einmalig** eine All-Pairs-Shortest-Path-Tabelle über den (kleinen, statischen) Graphen berechnet (einfacher BFS, da `travelTicks` hier als Kantengewicht dient, oder Floyd-Warshall — bei ~10–30 Orten trivial und deterministisch). Das ist eine **einmalige abgeleitete Lookup-Tabelle**, kein Pro-Tick-Algorithmus, und erfüllt damit exakt die Vorgabe "kein allgemeines Pathfinding-System zur Laufzeit".
- `AIState.Traveling` speichert `{ destination: LocationId, path: LocationId[], nextHopIndex: number, ticksRemainingInHop: number }`; `MovementSystem` arbeitet die vorab berechnete Route Hop für Hop ab. **Konsolidiert (Subtask 7, empirisch bestätigt in Subtask 5):** `Position.locationId` bleibt während der **gesamten** Reise — auch über Zwischen-Hops hinweg — am ursprünglichen Abreiseort und wird ausschließlich bei finaler Ankunft am `destination` aktualisiert (Invariante I3, Subtask 3 §5.2); `MovementEvent.fromLocation` bezeichnet entsprechend den ursprünglichen Abreiseort, nicht eine Zwischenstation.
- **Kapazität**: Datenfeld existiert, wird aber in v1 nicht durchgesetzt (keine Verdrängungs-/Warteschlangenlogik) — explizit als "sinnvolle Erweiterung" zurückgestellt, um keine Kontention-Auflösungslogik einzuführen, die für den Architekturnachweis nicht notwendig ist.
- Gebäude gehören genau einem Ort (`Location.buildingIds`), haben einen `kind` (`House`/`Field`/`Market`/`Workplace`) sowie eigenes `Inventory` und optional ein `ProductionProfile`.
- **Config-Herkunft der Buildings (Subtask 3.8):** Buildings werden in `SimulationConfig.worldGraph.buildings` als flaches Array authoriert, analog zu `worldGraph.locations` (Abschnitt 17). Jede `BuildingDefinition` trägt ihre eigene, config-seitig literal vergebene `BuildingId` und referenziert ihre `Location` über `locationId` — dieselbe Referenzrichtung, die `Building` im Domänenmodell (Subtask 3 §19) bereits besitzt. `Location.buildingIds` wird bei der Welterzeugung **einmalig aus dieser Richtung abgeleitet** (für jede Location: alle Buildings sammeln, deren `locationId` übereinstimmt) und danach als Teil des statischen `WorldState` unverändert persistiert — es gibt keine zweite, unabhängige Quelle, die mit `Location.buildingIds` in Konflikt geraten könnte.

---

## 11. Wirtschaft

```ts
type ResourceType = 'Food' | 'Wood'

interface Market {
  quote(resource: ResourceType, amount: number): number                         // pure, deterministisch
  trade(buyer: EntityId, seller: EntityId, resource: ResourceType, amount: number, world: WorldState): TradeResult
}
```

**Korrektur/Präzisierung ggü. Subtask 1:** Subtask 1 nannte eine "Geld-Abstraktion" als möglichen Ressourcentyp. Hier wird bewusst entschieden: **Tauschwirtschaft mit genau zwei realen Ressourcentypen (`Food`, `Wood`), keine abstrakte Währung.** Begründung: das erfüllt "mind. 2 Ressourcentypen" aus Subtask 1 §3.1, vereinfacht die Markt-Preisbildung (Tauschverhältnis statt Geldmenge/Inflation-Fragen, die außerhalb des Scopes lägen) und verändert nichts an der Erweiterbarkeitsaussage — ein währungsbasiertes Marktmodell ist eine alternative `Market`-Implementierung, die jederzeit ohne Änderung an Population-/Agent-/Kernlogik ergänzt werden kann.

- **Produktion**: `ProductionSystem` (Abschnitt 5) füllt Gebäude-`Inventory` passiv, skaliert mit Jahreszeit/Wetter und einer kleinen deterministischen Streuung (`production`-Substream).
- **Work-Action**: transferiert pro Tick eine konfigurierte Menge vom `Inventory` des Arbeitsplatz-Gebäudes ins `Inventory` der Person (begrenzt durch tatsächlichen Bestand — kein Lohn "aus dem Nichts"). Ist die Person noch nicht dort, reist sie zunächst hin (Abschnitt 9, Korrektur Subtask 4/ADR-14) — die Ausführung selbst bleibt ortsgebunden.
- **Trade-Action**: ruft die `Market`-Abstraktion auf, sobald die Person an einem `Market`-Gebäude eingetroffen ist; ist sie es noch nicht, reist sie zunächst hin (Abschnitt 9, Korrektur Subtask 4/ADR-14).
- **Default-Implementierung**: `FixedRatioMarket` — statisches, konfiguriertes Tauschverhältnis zwischen `Food` und `Wood`, keine Angebot/Nachfrage-Dynamik. Eine `SupplyDemandMarket` (gleiche Schnittstelle) ist die konkrete, in Subtask 1 §6 geforderte Nachweis-Erweiterung für "neues Wirtschaftsmodell ohne Kernänderung".

`Eat` konsumiert `Food` aus dem eigenen `Inventory` der Person — Nachschub ausschließlich über `Work` oder `Trade`, wodurch die Kette Produktion → Arbeit → Bestand → Konsum als ein zusammenhängender, beobachtbarer Ressourcenfluss entsteht.

---

## 12. Population und Lebenszyklus

**Verbindlich bestätigt (Subtask 3.6a):** Fortpflanzung betrifft ausschließlich Person. Alterung und Sterblichkeit gelten weiterhin generisch für alle lebenden Entities (Person und Animal).

- **Alterung**: `PopulationSystem` erhöht `Age.ticksAlive` für jedes lebende Entity pro Tick; `lifeStage` (`child`/`adult`) wird beim Lesen abgeleitet, nicht gespeichert.
- **Fortpflanzung**: eligibel sind erwachsene Personen am selben Ort mit Bedürfniswerten oberhalb einer konfigurierten Krisenschwelle. Iteration: Orte sortiert nach ID, innerhalb eines Ortes eligible Personen sortiert nach `EntityId`, sequenzielle Paarbildung (0&1, 2&3, …) statt aller Kombinationen — deterministisch und ohne O(n²)-Explosion. Pro eligibles Paar: Wurf gegen `reproduction`-Substream mit konfigurierter Geburtswahrscheinlichkeit. **Annahme (bewusste Vereinfachung):** keine Modellierung von Beziehungen/Zuneigung — jedes eligible Paar am selben Ort ist gleich wahrscheinlich, ausschließlich zur Demonstration der Populationsdynamik, nicht als soziales Modell.
- **Sterblichkeit**: zwei Ursachen — `starvation` (Hunger seit N konfigurierten Ticks bei/nahe 0) und `old_age` (Alter über einer maximalen Lebensspanne). Die Lebensspanne enthält eine Streuung, die **nicht** aus einem zur Laufzeit gezogenen RNG-Wert stammt, sondern als reine, deterministische Funktion `jitter(masterSeed, entityId)` berechnet wird — dadurch entsteht keine Abhängigkeit vom genauen Zeitpunkt/der Häufigkeit der Sterblichkeitsprüfung, was sonst selbst eine Determinismus-Falle wäre.
- **Zeitpunkt**: Tod wird in der Resolution-Phase **festgestellt** (Entity → `pendingRemovals`, `DeathEvent` sofort emittiert), aber erst in der Cleanup-Phase tatsächlich entfernt (Begründung: Abschnitt 3/6). Geburt: neues Entity wird in der Resolution-Phase erzeugt und ist ab Tick T+1 vollständig aktiv.

---

## 13. Persistenz

**Format**: JSON (bestätigt aus Subtask 1).

```ts
interface SaveFile {
  schemaVersion: number
  savedAtTick: number
  meta: { createdAt: string; engineVersion: string }   // rein informativ, keine Simulationslogik
  config: SimulationConfig
  world: {
    clock: { currentTick: number }
    rng: { masterSeed: number; streamStates: Record<string, number> }
    entities: { nextEntityId: EntityId; alive: EntityId[] }
    components: { identity: [...]; position: [...]; needs: [...]; inventory: [...]; age: [...]; aiState: [...]; relationships: [...] }
    environment: { season: Season; weather: Weather; locations: Location[]; buildings: Building[] }
    events: { history: SimEvent[]; nextSequence: number }   // nextSequence ergänzt, Subtask 3.9
  }
}
```

**Validierung**: `zod`-Schema, das diese Struktur exakt spiegelt, plus ein **separater Referenzintegritäts-Check** nach der Schema-Validierung (jede referenzierte `EntityId`/`LocationId` — in `Position.locationId`, `Relationships.parentIds/childIds`, `Building.locationId` — muss im selben Snapshot tatsächlich existieren; das kann `zod`s Formvalidierung allein nicht ausdrücken).

**Versionierung/Inkompatibilität — Prüfung der Subtask-1-Empfehlung: bestätigt, mit einer Präzisierung.** Fail-fast bleibt die Strategie: `schemaVersion` wird auf exakte Gleichheit geprüft (keine Semver-Toleranz), jede Abweichung führt zu einem `PersistenceError` mit beiden Versionsnummern. **Präzisierung**: es gibt in v1 **keinen** Auto-Migrationspfad (Subtask 1 nannte das als Tendenz — hier wird es zur endgültigen Entscheidung), da Migration ohne einen zweiten Snapshot-Stand zum Testen gegen echte "alte" Daten ohnehin nicht sinnvoll verifizierbar wäre.

**Fehlerbehandlung beim Laden** (Zuordnung zu Abschnitt 15):

| Fehlerfall | Fehlerklasse | Recoverable |
|---|---|---|
| Datei fehlt/unlesbar | `PersistenceError` | ja |
| Ungültiges JSON | `PersistenceError` | ja |
| `schemaVersion`-Mismatch | `PersistenceError` | ja |
| Zod-Formfehler | `ValidationError` | ja |
| Referenzintegritätsfehler | `ValidationError` | ja |

**Alle Ladefehler lassen den aktuell laufenden Weltzustand unverändert** — ein neuer `WorldState` wird ausschließlich nach vollständig erfolgreicher Validierung konstruiert und dann atomar eingetauscht (construct-then-swap), nie in-place während des Ladens mutiert (siehe Diagramm Abschnitt 20).

---

## 14. Observability

- **Logging**: `Logger`-Interface (`debug/info/warn/error(message, context)`), `context` immer mit `{ tick, system?, entityId? }`. Injektion über `TickContext`, kein globales Singleton — Tests können einen aufzeichnenden Logger einsetzen.
- **Statistics**: `StatisticsReporter` berechnet **on-demand** (keine separat mitgeführte, potenziell divergierende Zwischenstand-Struktur) aus Component Stores + Event-History: Population nach Art, durchschnittliche Bedürfniswerte, Ressourcenbestände gesamt, Geburten/Todesfälle der letzten N Ticks, Handelsvolumen der letzten N Ticks.
- **Event History**: begrenzter Ringpuffer, Standardkapazität konfigurierbar (Annahme-Default: letzte 5.000 Events, `config.observability.eventHistoryCapacity`). Die konfigurierte Kapazität wird beim Start protokolliert, damit die Begrenzung sichtbar, nicht lautlos ist.
- **Entity Inspection**: für den *aktuell laufenden* Weltzustand direkter Zugriff auf alle Component Stores einer ID. Inspektion eines *historischen* Ticks erfolgt **nicht** über eine mitgeführte Vollhistorie (zu teuer), sondern über **deterministischen Replay** (gleicher Seed/Config bzw. nächstliegender Spielstand bis zum Zieltick neu simulieren) — das ist die bewusst gewählte, durch Determinismus erst ermöglichte Methode, keine Einschränkung, für die man sich entschuldigen müsste.
- Alle Observer sind **strikt lesend** — direkte Konsequenz aus der WorldState-Mutationsregel in Abschnitt 4.

---

## 15. Fehlerarchitektur

Bewusst **minimale** Hierarchie (vier Klassen, keine künstliche Tiefe):

| Klasse | Bedeutet | Recoverable? | Wo behandelt | Geloggt? |
|---|---|---|---|---|
| `ConfigurationError` | Ungültige/fehlende Config beim Start | Nein (Prozess beendet sich vor Sim-Start) | `application`-Init | ja |
| `PersistenceError` | I/O- oder Formatfehler bei Save/Load (nicht gefunden, unlesbar, Parse-Fehler, Versionsmismatch) | Ja | `application` (Save/Load-Kommando) | ja |
| `ValidationError` | Strukturell parsebar, aber semantisch ungültig (Zod-Formfehler, Referenzintegrität) — gilt für Config **und** Savegames gemeinsam (Unterscheidung über ein `source`-Feld, nicht über separate Klassen) | Ja | `application` | ja |
| `SimulationError` | Ein Invariantenbruch **während** eines laufenden Ticks (Programmfehler-Klasse, kein Nutzerfehler) | Nein — bricht den laufenden Lauf ab | `application`-Tick-Schleife | ja, mit vollem Reproduktionskontext (Seed, Tick, betroffene Entity-IDs) |

**Bewusst nicht eingeführt**: ein separates `InvalidWorldStateError` — ein während des Laufs als ungültig erkannter Weltzustand *ist* ein Simulationsinvariantenbruch, keine vierte, künstlich abgegrenzte Klasse nötig.

**Grundprinzip**: lieber laut abbrechen als leise mit inkohärentem Zustand weiterlaufen — ein Weiterlaufen über eine erkannte Inkonsistenz hinweg würde exakt die Reproduzierbarkeit gefährden, die die Kernanforderung des Projekts ist.

---

## 16. Modul- und Dependency-Struktur

```
src/
├── domain/                 # keine Abhängigkeiten auf anderes src/
│   ├── components/          # Identity, Position, Needs, Inventory, Age, AIState, Relationships
│   ├── value-objects/       # Season, Weather, ResourceType, EntityId, LocationId, BuildingId, ActionId
│   └── events.ts            # SimEvent-Union
├── world/                   # hängt ab von: domain
│   ├── WorldState.ts
│   ├── EntityRegistry.ts
│   ├── ComponentStores.ts
│   ├── rng/                  # Substream-Orchestrierung (Seed-Ableitung, benannte Streams, getState()-Auslesen nach streamStates — Subtask 3.10/3.12), kein Algorithmus mehr
│   ├── EnvironmentState.ts   # Location-Graph, Weather/Season-Container
│   └── ports.ts              # Logger-, RandomSource-Interface u. Ä. — von simulation/ konsumierbar, ohne observability/ oder random/ zu importieren (Subtask 3.10)
├── random/                   # NEU (Subtask 3.10) — Infrastructure-Adapter für Zufall
│   └── Mulberry32RandomSource.ts   # implementiert world/ports.ts RandomSource; hängt ab von: domain, world (nur Typen)
├── simulation/               # hängt ab von: domain, world
│   ├── systems/                # Time, Weather, Production, Needs, Movement, ActionExecution, Population, EventResolution, Cleanup
│   ├── decision/                 # DecisionSystem + Action-Interface + konkrete Actions
│   └── economy/                   # Market-Interface + FixedRatioMarket
├── persistence/               # hängt ab von: domain, world, config (SaveFile.config: SimulationConfig, s. Abschnitt 13 — Subtask 7, konsolidiert; kein Zyklus, da config/ nicht von persistence/ abhängt)
│   ├── SaveFile-Schema (zod)
│   ├── save.ts / load.ts
│   └── migrations/               # v1 leer, Platzhalter dokumentiert
├── observability/              # hängt ab von: domain, world (nur lesend)
│   ├── Logger.ts                  # implementiert world/ports.ts
│   ├── StatisticsReporter.ts
│   └── EventHistoryView.ts
├── config/                     # hängt ab von: domain
│   ├── SimulationConfig-Schema (zod)
│   └── defaults.ts
├── application/                  # hängt ab von: simulation, persistence, observability, config, world
│   └── SimulationEngine.ts         # Tick-Schleife, save()/load()/run(n)
└── presentation/                    # hängt ab von: application (+ config zum Parsen, observability zur Ausgabe)
    └── cli.ts
```

**Dependency-Richtung (verbindlich)**: `domain ← world ← simulation ← application ← presentation`, mit `persistence`/`observability`/`config`/`random` (Subtask 3.10) seitlich neben `world` (abhängig von `domain`+`world`) und von `application` konsumiert. **Konsolidiert (Subtask 7):** `persistence/` hängt zusätzlich von `config/` ab, da `SaveFile.config: SimulationConfig` (Abschnitt 13) dies strukturell erfordert — dies ist keine Architekturverletzung, da `config/` seinerseits nicht von `persistence/` abhängt und somit kein Zyklus entsteht; die verkürzte Kurzfassung oben führt diese Kante nicht einzeln auf. **Keine zyklischen Abhängigkeiten**: `simulation/` importiert niemals aus `observability/`, `persistence/`, `config/`, `random/` oder `application/` — Querschnittsbedarf (Logging **und** Zufall) erhält `simulation/` ausschließlich über eine in `world/ports.ts` definierte Schnittstelle (`Logger` bzw. `RandomSource`), deren konkrete Implementierung in `observability/` bzw. `random/` liegt und per Dependency Injection über `TickContext` hereinkommt (Parameterübergabe, kein Import). `RandomSource`-Instanzen folgen damit exakt demselben Muster wie `Logger`.

---

## 17. Konfiguration

```ts
interface SimulationConfig {
  seed: number
  initialPopulation: { humans: number; animals: number }
  ticksPerDay: number
  daysPerSeason: number
  needs: { hungerDecayPerTick: number; energyDecayPerTick: number; socialDecayPerTick: number; starvationDeathThresholdTicks: number }
  reproduction: { minAdultAgeTicks: number; birthProbabilityPerEligiblePair: number; crisisThreshold: number }
  lifespan: { baseMaxLifespanTicks: number; lifespanJitterTicks: number }
  economy: { marketExchangeRatio: number; productionBaseRate: Record<ResourceType, number> }
  actions: { eatRestorePerTick: number; grazeRestorePerTick: number; sleepRestorePerTick: number; socializeRestorePerTick: number; workTransferPerTick: number; tradeAmountPerTrade: number }
  worldGraph: { locations: LocationDefinition[]; buildings: BuildingDefinition[] }   // handautoriert, keine Weltgenerierung
  observability: { eventHistoryCapacity: number; logLevel: 'debug' | 'info' | 'warn' | 'error' }
}

interface BuildingDefinition {   // neu, Subtask 3.8 — Config-Gegenstück zu Building (Subtask 3 §19)
  id: BuildingId                  // literal vergeben, wie LocationId bei LocationDefinition
  kind: 'House' | 'Field' | 'Market' | 'Workplace'
  locationId: LocationId          // Referenzrichtung Building → Location, konsistent mit dem Domänenmodell
}
```

**Konsolidiert (Subtask 7):** `reproduction.crisisThreshold` und der `actions`-Block sind Bestandteil der verbindlichen v1-`SimulationConfig` — mechanische Ergänzungen aus Subtask 4, die die bereits in diesem Abschnitt geforderte Regel "keine Magic Numbers in `simulation/`" sowie die in 03 §10 genannte "konfigurierte Krisenschwelle"/"konfigurierte Menge" für Work erst tatsächlich erfüllbar machen (Details/Werte: `defaults.ts`). Keine neue Architekturentscheidung — nur die Vervollständigung dieses Interface-Snippets auf den tatsächlichen v1-Stand.

- **Format**: JSON-Datei, geladen beim Start, validiert über dasselbe `zod`-Prinzip wie Savegames.
- **Defaults**: `defaults.ts` liefert eine vollständige Default-Config. **Entscheidung**: kein Deep-Merge einer partiellen Nutzer-Config mit Defaults (vermeidet die Frage "welche Defaults wurden gerade lautlos übernommen") — eine angegebene Config-Datei muss vollständig und valide sein; die CLI erlaubt stattdessen ein kleines, festes Set an Overrides (`--seed`, `--ticks`, Startpopulationsgrößen) als explizite Flags.
- **Ungültige Config** → `ConfigurationError`, Prozess beendet sich mit klarer Meldung, bevor irgendein Weltzustand existiert.
- **Keine Magic Numbers in `simulation/`**: jeder in einem System verwendete numerische Schwellwert stammt aus `SimulationConfig` via `TickContext` — Code-Review-Regel, nicht nur Konvention.
- **Weltgraph-Validierung** (Baseline-Ergänzung aus Subtask 3.5, verbindlich): `worldGraph.locations` wird beim Laden/Erzeugen zusätzlich gegen zwei Regeln geprüft, bevor eine Welt daraus entsteht — (1) **Bidirektionalität**: existiert eine Verbindung A→B, muss auch B→A existieren (Subtask 3 §5.1); (2) **Zusammenhang**: der Graph muss aus jedem Ort jeden anderen Ort erreichbar machen (Subtask 3 §15, Grundlage dafür, dass `InvalidLocation` nie als Laufzeitfehler auftritt, sondern nur als `ConfigurationError`/`ValidationError` beim Start). Beide Regeln waren bereits in Subtask 3 inhaltlich vorausgesetzt, hier als Ergänzung dieses Abschnitts nachgetragen.
- **Building-Validierung** (Baseline-Ergänzung aus Subtask 3.8, verbindlich): `worldGraph.buildings` wird zusätzlich gegen folgende Regeln geprüft, jeweils als `ValidationError` (dieselbe Kategorie wie Zod-Formfehler/Referenzintegritätsfehler bei Savegames, Abschnitt 15) — nie als Laufzeitfehler: (1) jede `BuildingId` ist innerhalb von `worldGraph.buildings` eindeutig (keine doppelte Vergabe); (2) jedes `BuildingDefinition.locationId` referenziert eine tatsächlich in `worldGraph.locations` vorhandene `LocationId` (keine unbekannte Location); (3) jede `BuildingDefinition` besitzt eine gültige, nicht-leere `locationId` (kein Building ohne Location). Eine vierte denkbare Fehlerklasse — eine inkonsistente Building-/Location-Referenz zwischen zwei unabhängigen Quellen — kann bei dieser Konfigurationsstruktur strukturell nicht auftreten, da `locationId` auf dem Building die einzige Quelle der Zuordnung ist; `Location.buildingIds` wird daraus einmalig abgeleitet, nicht separat authoriert.

---

## 18. CLI / externe Schnittstelle

Parsing über `node:util.parseArgs` (keine Dependency). Kommandos:

- `run --seed <n> --ticks <n> [--config <path>] [--load <path>] [--save <path>]` — erzeugt eine neue Welt (oder lädt `--load`), führt N Ticks aus, speichert optional am Ende.
- `inspect --load <path> --entity <id>` — vollständigen Komponentenzustand eines Entities ausgeben.
- `stats --load <path>` — aggregierte Statistiken ausgeben.
- `events --load <path> [--last <n>] [--type <EventType>]` — gefilterte Event-History ausgeben.

**Entscheidung**: **kein interaktives Pause/Resume innerhalb eines laufenden Prozesses.** Jeder CLI-Aufruf ist ein einzelner Batch-Durchlauf: Welt erzeugen/laden → N Ticks ausführen → optional speichern → Prozessende. Das beantwortet den "falls sinnvoll"-Vorbehalt zu Pause/Resume aus der Aufgabenstellung bewusst mit "nicht sinnvoll für dieses PoC" — ein Batch-CLI-Tool braucht keine Session-Verwaltung; Fortsetzung geschieht ohnehin über Save/Load.

`presentation/` enthält **keine** Domänenlogik — ausschließlich argv-Parsing, Aufruf von `application/`, Formatierung der Ausgabe.

---

## 19. Testarchitektur

**Unit Tests** (isolierte Fixtures, keine laufende Engine): RNG (Wiederholbarkeit, Substream-Unabhängigkeit, Zustands-Rehydrierung), `SimulationClock`-Ableitung an Tag-/Jahreszeitengrenzen, Bedürfnis-Zerfallsformel, jede `Action` (`canExecute`/`score`/`execute` einzeln), `FixedRatioMarket` (inkl. Randfall unzureichender Bestand), `ProductionSystem`-Ertragsformel.

**Integrationstests** (echte `SimulationEngine.tick()`-Schleife, kleine handgebaute Welt): vollständiger Agentenlebenszyklus (Hunger → Entscheidung Eat → Ausführung → Bedürfnisänderung, über Decision+Action-Systeme hinweg), Wirtschaftskreislauf (Produktion → Arbeit → Handel → Konsum über mehrere Ticks), Population (Geburt unter günstigen Bedingungen, Tod durch Verhungern inkl. Entfernung nach Cleanup).

**Determinismus-Tests** (dedizierte Suite `tests/determinism/`):
1. Gleicher Seed + Config, zwei unabhängige frische Engines, N Ticks → identischer `WorldState` (Deep-Equality über die kanonische Serialisierung, wiederverwendet aus dem Save-Serializer).
2. Gleicher Seed + Config, zwei Läufe → identische `EventHistory`-Sequenz Element für Element.
3. Speichern bei Tick N, Laden, Weiterlaufen bis N+M **vs.** direkter Lauf bis N+M ohne Speichern → identischer Endzustand.

**Determinismus-sensitive Bereiche** (besondere Testaufmerksamkeit): Tie-Breaking in `DecisionSystem`, Paarbildung/Lebensspannen-Jitter in `PopulationSystem`, RNG-Verbrauch in `WeatherSystem`/`ProductionSystem`, jede Iterationsreihenfolge über Entities/Orte, Round-Trip der RNG-Persistenz.

**Tooling**: Vitest (aus Abschnitt 1); ein `buildTestWorld({...overrides})`-Fixture-Helfer reduziert Wiederholung beim Aufbau von Test-Welten — eine testinterne, gerechtfertigte Abstraktion, die nicht mit dem Grundsatz "keine unnötigen Abstraktionen" kollidiert, da sie nicht in den Produktionscode einfließt.

---

## 20. Architekturdiagramme

**1. Gesamtarchitektur** — siehe Abschnitt 2.

**2. WorldState**
```
WorldState
 ├─ clock: { currentTick }
 ├─ rng: { masterSeed, streamStates{ name → state } }
 ├─ entities: { nextEntityId, alive[sortiert], pendingRemovals[] }
 ├─ components:
 │    ├─ identity, position, needs, inventory, age, aiState, relationships
 │    └─ (je: Map<EntityId, Component>)
 ├─ environment: { season, weather, locations[], buildings[] }
 └─ events: { pending[], history: RingBuffer }
```

**3. ECS-lite**
```
Entity (EntityId = Integer)
   │ Lookup in
   ▼
ComponentStores (eine Map je Componenttyp, Key = EntityId)
   │ gelesen & geschrieben von
   ▼
Systems (pure-ish Funktionen, kein eigener Zustand)
   │ geordnet in
   ▼
Phasen (Perception → Decision → Action → Resolution → Cleanup)
```

**4. Tick-/Phasenablauf** — siehe Abschnitt 6.

**5. Eventfluss**
```
System.execute(world, ctx) → ctx.emit(event)
        ↓
world.events.pending[]  (wächst während Perception…Resolution)
        ↓  (EventResolutionSystem, letztes Domänensystem der Resolution-Phase)
world.events.history (begrenzter Ringpuffer)   +   pending = []
        ↓ nur lesend
Observability (StatisticsReporter, EventHistoryView) → CLI-Ausgabe
        ↓
persistiert als Teil von SaveFile.world.events.history
```

**6. Utility-AI**
```
DecisionSystem (je Idle-Agent, sortiert nach EntityId)
   candidates = actions.filter(canExecute)
   scored     = candidates.map(score)          ← rein, deterministisch
   best       = max(scored)                     ← Tie-Break via agent-decision-Stream
        ↓
AIState.currentActivity = Performing{actionId,0} | Traveling{...}
        ↓ (folgende Ticks, Action-Phase)
ActionExecutionSystem: action.execute(...) je Tick
   done erst gültig ab ticksInAction ≥ minTicks
        ↓
AIState.currentActivity = Idle   (nächster Tick: wieder entscheidungsbereit)
```

**7. Persistenzfluss**
```
SAVE                                    LOAD
WorldState                              Dateibytes
   │ serialisieren                         │ JSON.parse            ── PersistenceError bei Fehler
   ▼                                       ▼
SaveFile-Objekt                         Rohobjekt
   │ zod-Validierung                        │ zod-Validierung        ── ValidationError bei Fehler
   ▼                                       ▼
schemaVersion prüfen                    schemaVersion prüfen        ── PersistenceError bei Mismatch
   │                                       ▼
   ▼                                    Referenzintegrität prüfen   ── ValidationError bei Fehler
JSON.stringify → Datei                     ▼
                                         neuen WorldState konstruieren
                                            ▼
                                         atomarer Tausch in SimulationEngine
```

**8. Dependency-Richtung** — siehe Abschnitt 16.

Alle acht Diagramme sind konsistent: dieselben Modul-/Komponentennamen, dieselbe Phasenreihenfolge, dieselbe Fehlerklassenbenennung.

---

## 21. Architekturentscheidungen (ADRs)

**ADR-01 — Programmiersprache**
Kontext: PoC muss statische Typisierung, Determinismus, JSON-Persistenz und zügige Umsetzbarkeit vereinen. Optionen: TypeScript/Node.js, Python, Rust. Entscheidung: TypeScript/Node.js. Begründung: Abschnitt 1. Konsequenzen: Vitest als Testframework, `zod` als einzige Laufzeit-Dependency, ESM/strict-Mode verbindlich.

**ADR-02 — ECS-lite statt OOP-Vererbung**
Kontext: neue Domänen müssen additiv integrierbar sein. Optionen: OOP-Hierarchie, ECS-lite, Actor-Modell. Entscheidung: ECS-lite. Begründung: Abschnitt 2/3 — einziger Ansatz, der Erweiterbarkeit *und* Determinismus strukturell zugleich sichert. Konsequenzen: Components enthalten nie Verhalten; jedes neue Feature = neue Component(s) + neues System.

**ADR-03 — Tick-basierte Simulation**
Kontext: Determinismus ist harte Anforderung. Optionen: Echtzeit, reines Discrete-Event, fester Tick. Entscheidung: fester, streng geordneter Tick mit optionalem "in N Ticks"-Scheduling darüber. Begründung: Abschnitt 2. Konsequenzen: keine Wanduhrzeit in der Logik, `SimulationClock` als einzige Zeitquelle.

**ADR-04 — Diskreter Weltgraph mit vorab berechneten Pfaden**
Kontext: Bewegung ohne Pathfinding-System zur Laufzeit. Optionen: Koordinatenraum + Pathfinding, reiner Nachbar-Graph, Graph + vorab berechnete All-Pairs-Pfade. Entscheidung: letzteres. Begründung: Abschnitt 10 — erfüllt "kein Pathfinding-System" wörtlich (einmalige Vorabberechnung, kein Pro-Tick-Algorithmus) und erlaubt trotzdem beliebige Ziele. Konsequenzen: Graph muss statisch/klein bleiben (v1-Annahme).

**ADR-05 — Utility-AI + FSM mit deklarierter Mindestdauer**
Kontext: glaubwürdiges, deterministisches Agentenverhalten ohne Planungssuche. Optionen: reine FSM, Utility-AI, GOAP, BDI. Entscheidung: Utility-AI (Auswahl) + FSM (Ausführung), Mindestdauer pro Action. Begründung: Abschnitt 9, Subtask 1 §5.1. Konsequenzen: `Action`-Interface mit `minTicks` verbindlich für jede neue Handlung.

**ADR-06 — Synchroner, rein additiver Event-Mechanismus (Korrektur ggü. Subtask 1)**
Kontext: Beobachtbarkeit ohne versteckten globalen Zustand oder Nichtdeterminismus durch Subscriber-Reihenfolge. Optionen: asynchroner Bus, synchroner Pub-Sub mit Subscribern, synchrone additive Queue→History ohne Reaktionsketten. Entscheidung: letzteres. Begründung: Abschnitt 7 — ein Pub-Sub-Mechanismus wäre für die im PoC benötigten Events unnötige Komplexität und eine zusätzliche Determinismus-Fehlerquelle. Konsequenzen: fachliche Sekundärwirkungen müssen direkt im auslösenden System programmiert werden, nicht über Event-Handler; spätere Subtasks können echte Reaktionsketten gezielt nachrüsten, falls nötig.

**ADR-07 — Deterministische RNG mit benannten, lazy erzeugten Substreams**
Kontext: Erweiterungen dürfen bestehende Zufallsfolgen nicht verschieben. Optionen: ein globaler Stream, vorab deklarierte Substreams, lazy benannte Substreams. Entscheidung: lazy benannte Substreams (`mulberry32` + FNV-1a-Ableitung). Begründung: Abschnitt 8. Konsequenzen: verbindliche Implementierungsregeln (kein `Math.random()`, neue Streams für neue Features, Persistenz des vollen Stream-Zustands).

**ADR-08 — Keine Parallelisierung**
Kontext: Determinismus vs. Performance bei 100–300 Agenten. Optionen: Multithreading/Worker Threads, sequenzielle Ausführung. Entscheidung: strikt sequenziell. Begründung: Subtask 1 §8/§9 — Performance ist bei dieser Zielgröße kein Problem, Parallelität wäre eine unnötige Determinismus-Gefährdung. Konsequenzen: keine `worker_threads`, keine geteilten Zustände über Threads.

**ADR-09 — JSON-Persistenz mit zod-Validierung**
Kontext: lesbares, debugbares, valides Speicherformat. Optionen: JSON (roh), JSON + zod, Binärformat. Entscheidung: JSON + zod. Begründung: Abschnitt 13. Konsequenzen: `zod` als einzige Runtime-Dependency, Referenzintegritäts-Check zusätzlich zur Schema-Validierung nötig.

**ADR-10 — Strikte Save-Versionierung ohne Auto-Migration in v1**
Kontext: Umgang mit inkompatiblen/älteren Spielständen. Optionen: strikte Ablehnung, Migrationskette. Entscheidung: strikte Ablehnung, Migration bewusst nicht in v1. Begründung: Abschnitt 13 — Migration wäre ohne echte Alt-Testdaten nicht sinnvoll verifizierbar. Konsequenzen: `migrations/`-Ordner existiert als dokumentierter, leerer Erweiterungspunkt.

**ADR-11 — Explizite, feste Systemreihenfolge statt Dependency-Graph-Planung**
Kontext: Ausführungsreihenfolge von zehn Systemen. Optionen: feste Reihenfolge, automatische topologische Sortierung. Entscheidung: feste Reihenfolge in fünf Phasen. Begründung: Abschnitt 5/6 — bei dieser Systemanzahl steht der Aufwand einer generischen Planung (Zyklenerkennung, Phasenverwaltung) in keinem Verhältnis zum Nutzen. Konsequenzen: neue Systeme werden manuell in eine Phase eingeordnet und dokumentiert; Wiederaufnahme dieser Entscheidung ist ein offener Punkt für spätere Subtasks (Abschnitt 9 aus Subtask 1).

**ADR-12 — Tauschwirtschaft ohne abstrakte Währung (Korrektur ggü. Subtask 1)**
Kontext: "einfache Wirtschaft" mit mindestens zwei Ressourcentypen. Optionen: Barter (reale Ressourcen), Geld-Abstraktion als zusätzlicher Ressourcentyp. Entscheidung: Barter mit `Food`/`Wood`. Begründung: Abschnitt 11 — vereinfacht Preisbildung, ohne die geforderte Erweiterbarkeit (austauschbare `Market`-Strategie) einzuschränken. Konsequenzen: ein währungsbasiertes Modell bleibt als alternative `Market`-Implementierung möglich.

**ADR-13 — Keine Entity-ID-Wiederverwendung**
Kontext: Referenzsicherheit bei Tod/Neuerzeugung von Entities. Optionen: Wiederverwendung freier IDs, monoton steigende, nie recycelte IDs. Entscheidung: keine Wiederverwendung. Begründung: Abschnitt 3 — verhindert lautlose Fehlreferenzierung nach Tod. Konsequenzen: `nextEntityId` wächst unbegrenzt (bei dieser Zielgröße irrelevant).

**ADR-14 — Anwesenheit ist Ausführungs-, nicht Auswahlvoraussetzung für Work/Trade (Korrektur, Subtask 4)**
Kontext: Die ursprüngliche Fassung ließ `canExecute()` von `Work`/`Trade` bereits exakte Anwesenheit am Zielgebäude prüfen (vormals Abschnitt 11). Da der Auswahlalgorithmus (Abschnitt 9) eine Action nur dann als `best` wählt, wenn sie bereits `canExecute`-fähig ist, konnte der in Abschnitt 9 Schritt 4 vorgesehene Reisemechanismus (`requiredLocation` → `Traveling`) für diese beiden ortsgebundenen Actions nie greifen — er war ein struktureller, aber unerreichbarer Erweiterungspunkt. Ein Testlauf (Subtask 4, Seed 42, 200 Ticks, Default-Config) zeigte die praktische Konsequenz: Personen, die nicht zufällig an einem produktiven Gebäude starteten, erhielten nie Ressourcen und verhungerten (18 von 20 nach 200 Ticks). Optionen: (a) wörtliche Fassung beibehalten, Massensterben als akzeptierte PoC-Grenze dokumentieren; (b) `canExecute()` auf grundsätzliche Erreichbarkeit lockern und den bereits vorgesehenen `requiredLocation`-Mechanismus aktivieren; (c) andere Startverteilung/Startausstattung. Entscheidung: (b), auf ausdrückliche Weisung. Begründung: Der Reisemechanismus war bereits in Abschnitt 9/ADR-05 vorgesehen — die Korrektur aktiviert ihn, statt Architektur neu zu erfinden; Option (c) wurde ausdrücklich ausgeschlossen, da sie das strukturelle Problem nur verschleiert hätte. Konsequenzen: `canExecute()` von Work/Trade prüft nur noch, ob irgendwo ein passendes Gebäude existiert; `requiredLocation()` liefert den Zielort; `execute()` bleibt unverändert ortsgebunden und ist die einzige Stelle, die tatsächliche Anwesenheit voraussetzt.

---

## 22. Architektur-Risiken

| Risiko | Wahrscheinlichkeit | Auswirkung | Gegenmaßnahme |
|---|---|---|---|
| Subtile Determinismus-Brüche (Iterationsreihenfolge, RNG-Nutzung) | mittel | hoch — Kernanforderung nicht erfüllt | Determinismus-Tests von Anfang an (Abschnitt 19), Code-Review-Checkliste (Subtask 1 §5.4) |
| Zu starke Kopplung zwischen `Action`-Implementierungen und `economy/` (Trade-Action kennt Market-Interface) | niedrig | mittel | Kopplung ausschließlich über die `Market`-Schnittstelle, nie über konkrete Implementierungen |
| ECS-Overengineering (voller ECS-Unterbau statt ECS-lite) | niedrig | mittel — Zeitverlust ohne PoC-Nutzen | Bewusste Begrenzung auf handgeschriebene Maps statt generischem Component-Framework |
| Utility-AI-Oszillation trotz Mindestdauer | mittel | mittel — unplausibles, aber nicht falsches Verhalten | `minTicks` pro Action verbindlich; Beobachtung über Event-History/Statistics |
| Persistenz-Schema-Drift bei künftigen Component-Erweiterungen | mittel | mittel | strikte Versionsprüfung (ADR-10), jede Component-Änderung erzwingt Versionserhöhung |
| Event-History-Wachstum bei langen Läufen | niedrig (bereits durch Ringpuffer begrenzt) | niedrig | konfigurierte Kapazität, beim Start protokolliert |
| Performance bei Zielgröße | sehr niedrig | niedrig | keine vorzeitige Optimierung; abstrakte Orte vermeiden O(n²) strukturell (Subtask 1 §9) |
| Scope Creep zur Erreichung der LOC-Zahl | mittel | mittel — unnötige Komplexität | Faustregel aus Subtask 1 §6 bleibt verbindlich |

---

## Architecture Baseline

Diese Baseline ist der verbindliche Stand für Subtask 3. Subtask 3 konkretisiert die hier festgelegten Schnittstellen und Domänenregeln, erfindet die Architektur nicht neu.

| # | Frage | Antwort |
|---|---|---|
| 1 | Sprache | TypeScript auf Node.js 22 LTS, `strict`, ESM (Abschnitt 1) |
| 2 | Gesamtarchitektur | Schichtenmodell `domain ← world ← simulation ← application ← presentation`, plus `persistence`/`observability`/`config`/`random` seitlich (Abschnitt 2, Subtask 3.10) |
| 3 | Module | `domain/`, `world/`, `simulation/`, `persistence/`, `observability/`, `config/`, `random/`, `application/`, `presentation/` (Abschnitt 16, Subtask 3.10) |
| 4 | Komponenten | `Identity`, `Position`, `Needs` (Person voll, Animal ohne `social` — Subtask 3.6b), `Inventory`, `Age`, `AIState`, `Relationships` — reine Daten (Abschnitt 3) |
| 5 | Systeme | `TimeSystem`, `WeatherSystem`, `ProductionSystem`, `NeedsSystem`, `DecisionSystem`, `MovementSystem`, `ActionExecutionSystem`, `PopulationSystem`, `EventResolutionSystem`, `CleanupSystem` (Abschnitt 5) |
| 6 | Reihenfolge | Perception → Decision → Action → Resolution → Cleanup, intern feste Systemreihenfolge (Abschnitt 6) |
| 7 | Events | Discriminated Union, additive Queue→History, kein Pub-Sub (Abschnitt 7) |
| 8 | Determinismus | benannte, lazy erzeugte RNG-Substreams (`mulberry32`), sortierte Iteration, persistierter RNG-Zustand (Abschnitt 8) |
| 9 | Agentenentscheidungen | Utility-AI-Auswahl + FSM-Ausführung, `Action`-Interface mit `minTicks` (Abschnitt 9) |
| 10 | Persistenz | JSON + `zod` + Referenzintegrität, strikte Versionsprüfung, construct-then-swap (Abschnitt 13) |
| 11 | Observability | strikt lesende Logger/Statistics/EventHistoryView, historische Inspektion via Replay (Abschnitt 14) |
| 12 | Dependency-Struktur | streng abwärts gerichtet, keine Zyklen, Cross-Cutting nur über Interfaces in `world/ports.ts` (Abschnitt 16) |
| 13 | Tests | Unit / Integration / Determinismus, dediziert (Abschnitt 19) |
| 14 | CLI | `run` / `inspect` / `stats` / `events`, Batch-Prozess, keine Session-Verwaltung (Abschnitt 18) |
| 15 | Endgültig entschieden | Sprache, ECS-lite, Tick-Modell, Phasenreihenfolge, RNG-Architektur, Event-Mechanismus, Persistenzformat/-versionierung, keine Parallelisierung, keine ID-Wiederverwendung, Barter-Wirtschaft (ADRs 1–13); zusätzlich (Subtasks 3.5–3.12): Weltgraph-Validierung (bidirektional + zusammenhängend, nie Laufzeitfehler), Fortpflanzung ausschließlich Person / Alterung+Sterblichkeit generisch (3.6a), Animal-Needs ohne `social` (3.6b), getrennte RNG-Streams `agent-decision`/`agent-action` (3.7), Buildings-Config via `worldGraph.buildings`/`BuildingDefinition` (3.8), `nextSequence` in `WorldState.events`/`SaveFile.world.events` (3.9), `RandomSource`/`Mulberry32RandomSource`-Modulplatzierung in `world/ports.ts`/`random/` (3.10), `RandomSource.getState()` für RNG-Persistenz (3.12); zusätzlich (Subtask 4): Anwesenheit ist für Work/Trade Ausführungs-, nicht Auswahlvoraussetzung — `requiredLocation`-Reisemechanismus aktiviert (ADR-14) |
| 16 | Bewusst offen für spätere Subtasks | Dependency-Graph-basierte Systemplanung, Auto-Migration für Savegames, dynamischer Weltgraph/Gebäudebau, Kapazitätsdurchsetzung an Orten, echte Event-Reaktionsketten, Sozialgraph über Eltern-Kind hinaus |

*Nächster Schritt: Subtask 3 konkretisiert Domänenregeln und Interfaces auf Basis dieser Baseline — ohne die hier getroffenen Struktur- und Ordnungsentscheidungen erneut zu verhandeln, außer eine substanzielle, hier nicht antizipierte Erkenntnis erfordert eine ausdrücklich begründete Korrektur.*

---

## v1 Baseline — frozen after Subtask 7

**Status: v1 Baseline — frozen after Subtask 7.**

Die v1 wurde in Subtask 4 implementiert, in Subtask 4.1 gegen 01–03 konsistenzgeprüft (Befund: *Baseline konsistent mit dokumentierten Abweichungen*), in Subtask 5 empirisch validiert (Befund: *Simulation empirisch plausibel und Baseline-konform*) und in Subtask 6 auf Produktionsreife geprüft (Befund: *Release-ready with documented debt*, keine Releaseblocker). Subtask 7 hat die in Subtask 4.1/6 bekannten Dokumentations-Residuen konsolidiert (s. u.) und diesen Stand als v1-Baseline eingefroren. Ab hier gilt: Änderungen an Domänenregeln, Simulationsregeln, Architektur oder Konfiguration sind **keine stillschweigenden Korrekturen** einer laufenden v1 mehr, sondern ausdrücklich zu kennzeichnende Entscheidungen einer neuen Entwicklungsphase (v2).

### Konsolidierte Dokumentations-Residuen (vormals Subtask 4.1 §10.2 / Subtask 6 Abschnitt 15)

| # | Residuum | Fundstelle(n) | Status nach Subtask 7 |
|---|---|---|---|
| 1 | `Action`-Interface-Snippet ohne `requiredLocation`/`events` | 02 §9 | korrigiert |
| 2 | `Action`-Snippet in 03 ohne `events` | 03 §7.2 | korrigiert |
| 3 | `SimulationConfig`-Snippet ohne `actions`/`crisisThreshold` | 02 §17 | korrigiert |
| 4 | `Age`-Darstellung ohne `ticksAtZeroHunger` | 02 §3, 03 §6 | korrigiert |
| 5 | `Position.travel?: TravelState` nie umgesetzt, nicht nachgetragen | 02 §3, 02 §10 | korrigiert (Feld entfernt, Reisezustand-Alleinstelligkeit von `AIState.Traveling` präzisiert, Invariante I3 empirisch referenziert) |
| 6 | `persistence/ → config/`-Abhängigkeit nicht im Modulbaum-Kommentar | 02 §16 | korrigiert (transparent dokumentiert, ausdrücklich keine Architekturverletzung) |

### v1 Technical Debt (Kategorie B, aus Subtask 6 — bewusst nicht behoben, nicht releasekritisch)

1. Fehlende dedizierte Integrationstests für die drei in §19 wörtlich geforderten Szenarien (voller Agentenlebenszyklus Hunger→Eat über Decision+Action-Systeme; Wirtschaftskreislauf Produktion→Arbeit→Handel→Konsum; Population inkl. Entfernung nach Cleanup) durch die tatsächliche Tick-Schleife. Die zugrunde liegende Funktionalität ist unit-getestet und empirisch (Subtask 5) bestätigt, aber nicht dauerhaft regressionsgesichert.
2. Acht der zehn Systeme (`TimeSystem`, `WeatherSystem`, `ProductionSystem`, `DecisionSystem`, `MovementSystem`, `ActionExecutionSystem`, `EventResolutionSystem`, `CleanupSystem`) besitzen kein eigenes Unit-Test-File — nur indirekt über die volle Tick-Schleife mitgetestet.
3. CLI (`presentation/cli.ts`): `run --ticks <nicht-numerisch>` läuft klaglos mit 0 Ticks statt einen `ConfigurationError` zu werfen — reine Argv-Validierungslücke, keine Domänenlogik betroffen.
4. `npm audit` meldet Schwachstellen ausschließlich in Dev-Dependencies (`esbuild`/`vite`, transitiv über `vitest@2.x`) — Runtime-Dependency (`zod`) ist unbetroffen (`npm audit --omit=dev` → 0 Funde). Behebung würde einen Breaking-Change auf `vitest@4.x` erfordern.
5. Keine Coverage-Infrastruktur installiert — Testabdeckung wurde qualitativ statt quantitativ bewertet.

**Diese fünf Punkte sind bekannt, bewertet und für v1 bewusst nicht releasekritisch. Sie gelten nicht als behoben.**

### Verbesserungsvorschläge für spätere Versionen (Kategorie C — nicht Bestandteil des v1-Freeze)

1. `SimulationEngine.emit()`: `as never` durch die idiomatischere `as SimEvent`-Assertion ersetzen (rein stilistisch).
2. `README.md` um eine kurze Nutzungsanleitung ergänzen (in Subtask 7 umgesetzt, s. README).
3. Optionales Coverage-Tooling (`@vitest/coverage-v8`) für eine zukünftige Version.

### Ausdrücklich unverändert gegenüber Subtask 4–6

Domänenregeln, Simulationsregeln, Architektur, Konfigurationswerte, Tests und Implementierung wurden durch Subtask 7 **nicht** verändert — ausschließlich diese Dokumentation wurde auf den bereits zuvor implementierten und validierten Stand nachgezogen.
