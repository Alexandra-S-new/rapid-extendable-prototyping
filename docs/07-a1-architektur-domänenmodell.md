# Subtask 15/16 — A1 Architektur- und Domänenmodell: Erweiterter Sozialgraph

> **Status: Verbindlich, konzeptionell abgeschlossen. Keine Implementierung.** Dieses Dokument formalisiert die in Subtask 15 getroffenen fachlichen und architektonischen A1-Entscheidungen. Es ersetzt, verändert oder relativiert keine Aussage der eingefrorenen v1-Baseline (`01`–`03.5`) oder der eingefrorenen v2-Baseline (`04`, `05`). Kein produktiver Code wurde im Rahmen dieses Dokuments geändert.

Legende: **Entscheidung** (verbindlich für A1) · **Invariante** (formal, testbar) · **Risiko** · **Offene Frage** (kein Blocker).

---

## 1. Geltungsbereich

Dieses Dokument spezifiziert **ausschließlich** A1 — den erweiterten Sozialgraphen (binäre, reziproke Freundschaft). Es trifft keine Entscheidung für B3 (wirtschaftliche Vertiefung) oder andere in Subtask 14 identifizierte, nicht gewählte Entwicklungsrichtungen.

## 2. Ausgangsbasis / V2-Freeze

Verbindliche, unveränderte Ausgangsbasis: `docs/01`–`03.5` (v1-Baseline, frozen seit Subtask 7), `docs/04`–`05` (v2-Baseline, frozen seit Subtask 13). Insbesondere bleiben **vollständig unverändert**: ADR-V2-01 bis ADR-V2-09, V2-I1 bis V2-I9 (inkl. V2-I2b), die `partnerId`-Semantik (aktuelle, exklusive, monogame, reziproke Partnerschaft, Standing-Invariante, endet ausschließlich durch Tod — Subtask 12/13), die fünf RNG-Substreams, `schemaVersion=2` als abgeschlossener v2-Stand, alle elf v1/v2-Systeme, alle sechs Actions, alle 133 Tests.

## 3. Domänenmodell

A1 erweitert ausschließlich `Relationships` um genau ein neues Feld. Kein neues Component, kein neuer Entity-Typ, keine Erweiterung von `Identity`, `Needs`, `Age`, `AIState`, `Inventory` oder `Building`.

## 4. `friendIds`

**Entscheidung (verbindlich):** `Relationships.friendIds: EntityId[]` — Pflichtfeld (kein `?`), stets ein Array, kann leer sein. Analog zu `parentIds`/`childIds` (nicht analog zum optionalen `partnerId?`, da Mehrfachheit kein „fehlt/gesetzt"-Unterschied benötigt). Gilt für `Identity.kind==='person'`; bei `kind==='animal'` bleibt das Feld strukturell `[]` (konsistent mit dem bereits bestehenden Muster: `parentIds`/`childIds` existieren auch bei Animal, werden dort aber nie befüllt).

## 5. Beziehungssemantik

Genau ein neuer Beziehungstyp: binäre, reziproke Freundschaft. **Nicht** Bestandteil von A1: `acquaintance`, `disliked`, `trusted`, `rival`, `romantic`, gewichtete Beziehungen, ein generisches Relationship-Framework. `friendIds` ist von `parentIds`, `childIds` und `partnerId` vollständig unabhängig und darf mit keinem dieser Felder verschmolzen, vereinheitlicht oder semantisch vermischt werden.

## 6. Reziprozität

**Entscheidung (verbindlich):** Freundschaft ist reziprok. Standing-Invariante:

> `A.friendIds ∋ B ∧ alive(A) ∧ alive(B) ⇒ B.friendIds ∋ A`

**Struktureller Unterschied zu `partnerId` (explizit festgehalten):** Freundschaft ist **nicht exklusiv** — es gibt keine Reservierung, keine Monogamie, keine Neuzuweisung, die eine bestehende Freundschaft verdrängen könnte. Das V2-I2-Fehlermuster aus Subtask 11 (Reservierung + Exklusivität + Neuzuweisung) hat hier **kein Analogon**, weil keiner der drei ursächlichen Faktoren vorhanden ist. A1 reproduziert dieses Problem daher strukturell nicht.

## 7. Lebenszyklus

**Entscheidung (verbindlich):** Standing-Beziehung. Kein Verblassen, keine Gewichtung, keine Mindestkontaktpflicht, keine Kapazitätsgrenze, keine automatische Auflösung durch Ortswechsel, Zeitablauf oder Ausbleiben weiterer gemeinsamer Aktivität. Endet ausschließlich durch Tod; die Referenz bleibt danach bestehen (kein kaskadierendes Bereinigen, konsistent mit `parentIds`/`childIds`/`partnerId`, 03-§15-Prinzip). Da Freundschaft nicht exklusiv ist, gibt es **kein** Analogon zu V2-I2b nötig — nichts war „reserviert", also muss auch nichts nach dem Tod „wieder verfügbar" gemacht werden.

## 8. Entstehungsmechanismus

**Entscheidung (verbindlich):** Deterministisch, kein RNG. Bedingung: zwei Personen sind am selben Ort und führen gleichzeitig eine `Socialize`-Ausführung aus (`AIState.currentActivity.kind==='Performing' ∧ actionId==='Socialize'`). **Bestandsbefund, handlungsrelevant:** `Socialize` (`src/simulation/decision/actions/Socialize.ts`) hat aktuell keine Gegenpartei-/Zielauswahl — es ist eine rein solitäre Aktion, die nur den eigenen `social`-Bedarf erhöht. Die Entstehungsbedingung wird deshalb **nicht** durch eine Änderung von `Socialize.ts` umgesetzt, sondern durch ein neues, eigenständiges System erkannt (Abschnitt 9). Bei mehr als zwei Kandidaten am selben Ort: deterministische Sortierung nach `EntityId`, kein RNG, keine Abhängigkeit von Iterationsreihenfolge nicht-geordneter Strukturen.

## 9. `SocialBondingSystem` (Arbeitsname, nicht final)

**Entscheidung (verbindlich, Grundzüge):** Ein neues, eigenständiges System (analog zum `MaintenanceSystem`-Präzedenzfall aus ADR-V2-03 — Single-Responsibility statt Erweiterung eines bestehenden Systems). Verantwortung: Erkennen gemeinsamer, co-lokaler `Socialize`-Ausführung; deterministische Kandidatenbildung; Erzeugen einer reziproken Freundschaft, falls noch nicht vorhanden. Das System verändert **keine** anderen Beziehungen (`parentIds`, `childIds`, `partnerId`) und liest ausschließlich bereits existierenden Zustand (`Position`, `AIState`, `Relationships`) — kein neuer globaler Zustand, kein neuer Zähler.

## 10. Tick-Integration

**Entscheidung (verbindlich):** Resolution-Phase, nach `PopulationSystem`. Begründung: `PopulationSystem` gruppiert bereits Personen nach Ort (Reproduktions-Pairing) — dieselbe Positionsinformation ist zum gleichen Zeitpunkt im Tick verfügbar; eine thematisch andersartige dritte Verantwortung (Freundschaftsbildung) wird jedoch bewusst **nicht** in `PopulationSystem` selbst untergebracht (Single-Responsibility, wie bei `MaintenanceSystem`/`ProductionSystem`). Die bestehende Tick-Reihenfolge (`TimeSystem → WeatherSystem → MaintenanceSystem → ProductionSystem → NeedsSystem → DecisionSystem → MovementSystem → ActionExecutionSystem → PopulationSystem → EventResolutionSystem → CleanupSystem`) wird durch die reine Ergänzung eines neuen Systems nicht umgebaut.

## 11. Determinismus

Vollständig deterministisch, keine Abhängigkeit von Wanduhrzeit/Systemzustand außerhalb von `WorldState`.

## 12. RNG

**Entscheidung (verbindlich):** Kein neuer RNG-Substream. A1 verändert die bestehende RNG-Architektur nicht — die fünf bestehenden Substreams (`weather`, `production`, `reproduction`, `agent-decision`, `agent-action`) bleiben exakt wie sie sind, unangetastet und ohne neue Bedeutung.

## 13. Persistenz

**Entscheidung (verbindlich):** `friendIds: EntityId[]` wird Teil von `SaveFile` (Pflichtfeld, nicht optional-tolerant). Serialisierung deterministisch aufsteigend nach `EntityId` sortiert.

## 14. Schema-Version 3

**Entscheidung (verbindlich):** `CURRENT_SCHEMA_VERSION` steigt von 2 auf **3**. Kein Migrationspfad (ADR-10 unverändert fortgeführt, exakt wie beim 1→2-Sprung in ADR-V2-09). Ein Schema-2-Savegame wird von einer A1-fähigen Engine korrekt mit `PersistenceError` abgelehnt — kein optionales Fehlen von `friendIds` in einem gültigen Schema-3-Datensatz, keine Rückwärtskompatibilität.

## 15. Referenzintegrität

Jede `friendIds`-Referenz muss eine plausible `EntityId` sein (`< nextEntityId`), analog zur bestehenden Prüfung für `parentIds`/`childIds`/`partnerId`. Keine Lebendigkeitspflicht bei der reinen Referenzprüfung (Plausibilität ≠ Lebendigkeit, konsistent mit 03-§15-Prinzip).

## 16. Selbstreferenz-/Duplikatregeln

Zwei **neue** Prüfregeln, die bei `parentIds`/`childIds`/`partnerId` bislang nicht benötigt wurden (dort strukturell durch die Baumeigenschaft der Abstammung bzw. die Einzelfeld-Natur von `partnerId` ausgeschlossen), bei einer bidirektional gepflegten Liste jedoch notwendig sind: keine Selbstreferenz (`A ∉ A.friendIds`), keine Duplikate innerhalb eines `friendIds`-Arrays.

## 17. Invarianten V2-A1-I1 bis V2-A1-I6

| # | Invariante | Wo zu erzwingen (spätere Implementierung) |
|---|---|---|
| V2-A1-I1 | Jede `friendIds`-Referenz ist eine plausible `EntityId` (`< nextEntityId`) | `persistence/deserialize.ts` |
| V2-A1-I2 | Standing-Reziprozität: `A.friendIds ∋ B ∧ alive(A) ∧ alive(B) ⇒ B.friendIds ∋ A` | `SocialBondingSystem` (atomare Zuweisung bei Entstehung; da nicht-exklusiv, keine spätere Neuzuweisung möglich, die sie brechen könnte) |
| V2-A1-I3 | Keine Selbstbeziehung: `A ∉ A.friendIds` für jede lebende Person A | `SocialBondingSystem`, `persistence/deserialize.ts` |
| V2-A1-I4 | Keine Duplikate innerhalb von `friendIds` | `SocialBondingSystem`, `persistence/deserialize.ts` |
| V2-A1-I5 | `friendIds` wird nur für `kind==='person'` gepflegt; bei `kind==='animal'` bleibt es strukturell `[]` | Welterzeugung, `SocialBondingSystem` |
| V2-A1-I6 | `friendIds` und `partnerId` sind vollständig unabhängig — keine gegenseitige Reservierung, keine Verdrängung, keine Exklusivität, keine Änderung der Partnerschaftssemantik | `SocialBondingSystem` (liest/schreibt ausschließlich `friendIds`, nie `partnerId`) |

Diese Invarianten sind **zusätzlich** zu den zehn bestehenden V2-Invarianten und ersetzen, verschmelzen mit oder schwächen keine davon.

## 18. Auswirkungen auf bestehende V2-Invarianten

| Invariante | Auswirkung |
|---|---|
| V2-I1 (partnerId-Referenzintegrität) | unverändert |
| V2-I2 (Partnerschaftsreziprozität) | unverändert |
| V2-I2b (Wiederverpartnerung nach Tod) | unverändert |
| V2-I3 (Altersgate Work/Trade) | unverändert — Freundschaft erhält bewusst **kein** Altersgate, da auch `Socialize` selbst keinem Altersgate unterliegt (Konsistenzentscheidung, kein Widerspruch zu V2-I3 selbst, da diese ausschließlich `Work`/`Trade` betrifft) |
| V2-I4 (condition-Klemmung) | unverändert |
| V2-I5 (condition-Präsenzregel) | unverändert |
| V2-I6 (Produktionsboden) | unverändert |
| V2-I7 (Marktpreis-Klemmung) | unverändert |
| V2-I8 (Care-Anwesenheitsvoraussetzung) | unverändert |
| V2-I9 (Persistenzvollständigkeit der v2-Felder `partnerId`/`role`/`condition`) | unverändert — gilt weiterhin ausschließlich für diese drei ursprünglichen Felder; die Persistenzvollständigkeit von `friendIds` wird als **eigenständige** neue Invariante (V2-A1-I1) geführt, nicht durch Erweiterung von V2-I9 |

**Ergebnis:** Keine bestehende V2-Invariante muss angepasst werden. Kein STOPP erforderlich.

## 19. ADRs

**ADR-A1-01 — Freundschaft als binäres, reziprokes `friendIds`-Feld**
Status: Accepted. Entscheidung: `Relationships.friendIds: EntityId[]`, kein generisches Relationship-Framework, keine weiteren Beziehungstypen. Begründung: Abschnitt 6/7 dieses Dokuments, Variantenanalyse `docs/06` Abschnitt 7.1. Alternativen: gerichtete Präferenz (Rejected — kein zusätzlicher Nutzen), gewichtete Beziehung (Rejected — keine aktuelle Verwendung der Zahl), mehrere Typen (Rejected — kein unterscheidendes Systemverhalten), generisches Relationship-Modell (Rejected — Vermischungsrisiko mit `partnerId`). Betroffene Module: `domain/components/relationships.ts`.

**ADR-A1-02 — Deterministische Entstehung aus gemeinsamer, co-lokaler `Socialize`-Ausführung**
Status: Accepted. Entscheidung: neues, eigenständiges `SocialBondingSystem`, Resolution-Phase nach `PopulationSystem`; keine Änderung von `Socialize.ts`. Begründung: Abschnitt 8/9/10. Alternativen: expliziter Zufallsprozess (Rejected — kein fachlicher Bedarf für RNG), Score-basierte Entstehung (Rejected — GOAP-artige Zusatzkomplexität ohne Bedarf). Betroffene Module: neues `simulation/systems/SocialBondingSystem.ts` (Name nicht final), `simulation/systems/index.ts`, `application/SimulationEngine.ts`. Persistenzfolgen: keine über Abschnitt 14 hinaus. Determinismusfolgen: keine (kein RNG).

**ADR-A1-03 — Standing-Beziehung ohne Verblassen, Gewichtung oder Kapazitätsgrenze**
Status: Accepted. Entscheidung: Lebenszyklus wie Abschnitt 7. Begründung: kein identifizierter fachlicher Bedarf für Komplexität über die minimale Modellierung hinaus. Alternativen: dynamische Stärke (Rejected), ereignisbasiertes Verschwinden (Rejected). Betroffene Module: `SocialBondingSystem` (keine Löschlogik außer der allgemeinen, unveränderten Cleanup-Semantik).

**ADR-A1-04 — Keine Integration in `Socialize` oder `DecisionSystem`**
Status: Accepted. Entscheidung: Sozialgraph zunächst rein additive Beziehungsschicht ohne Verhaltenseinfluss. Begründung: Abschnitt 6 (`docs/06`) — vermeidet Rückkopplungsrisiko und verhindert, dass A1 stillschweigend zu einem Relationship-AI-System wird. Betroffene Module: keine (explizite Nicht-Entscheidung, `Socialize.ts`/`DecisionSystem.ts` bleiben unverändert).

**ADR-A1-05 — Persistenz über `friendIds`, Schema-Version 3, kein Migrationspfad**
Status: Accepted. Entscheidung: Abschnitt 13/14/15/16. Begründung: neues Pflichtfeld erfordert Versionssprung (analog ADR-V2-09); ADR-10 bleibt unverändert bestehen. Alternativen: optionales Feld innerhalb Schema 2 (Rejected — `friendIds` ist kein „fehlt/gesetzt"-Feld wie `partnerId?`, sondern strukturell immer vorhanden, ein Weiterführen unter Schema 2 wäre fachlich unpräzise); echter Migrationspfad (Rejected — hebt ADR-10 ohne Bedarf auf). Betroffene Module: `persistence/schema.ts`, `persistence/deserialize.ts`.

## 20. Teststrategie

Siehe `docs/06` Abschnitt 16 (identisch, hier nicht wiederholt) — zusätzlich verbindlich: Standing-Invariant-Test exakt nach dem Muster von `tests/simulation/partnership.test.ts` (direkte Lehre aus Subtask 11–13: ein Test, der nur den günstigen Fall unmittelbar nach Entstehung prüft, hätte das V2-I2-Problem nicht gefunden — dieselbe Prüftiefe wird hier von Anfang an verlangt, obwohl A1 strukturell risikoärmer ist).

## 21. Long-Run-Verifikation

Siehe `docs/06` Abschnitt 17 (identisch, hier nicht wiederholt).

## 22. Scope / Out-of-Scope

**Nicht Bestandteil von A1:** Haushalte, Rollenwechsel, Krankheit, Prädator/Beute, neue Tierarten, GOAP, Dashboard, UI, dynamischer Weltgraph, Gebäudebau, Pathfinding, Migration, Politik, Konflikte, Krieg, generisches Relationship-System, Freundschaftsstärke, Freundschaftsverfall, Freundschaftskapazität, mehrere Beziehungstypen, Socialize-Umbau, Decision-Integration, neue Entity-Typen. **B3 (wirtschaftliche Vertiefung) wird nicht umgesetzt** und nicht Teil dieses Dokuments.

## 23. Architekturfolgen (Impact-Analyse)

| Schicht | Datei/Komponente | Änderung | Art |
|---|---|---|---|
| Domain | `domain/components/relationships.ts` | `+ friendIds: EntityId[]` | additiv |
| World | `world/createWorld.ts` | `spawnPerson`/`spawnAnimal`: `friendIds: []` bei Erzeugung | additiv |
| Simulation | `simulation/systems/SocialBondingSystem.ts` (neu) | Entstehungslogik | additiv, neues System |
| Simulation | `simulation/systems/index.ts` | neuer Export | additiv |
| Application | `application/SimulationEngine.ts` | neuer Systemaufruf, Resolution-Phase nach `PopulationSystem` | additiv |
| Persistence | `persistence/schema.ts` | `friendIds` in `relationshipsSchema`, `CURRENT_SCHEMA_VERSION` 2→3 | additiv + Versionssprung |
| Persistence | `persistence/deserialize.ts` | Referenzintegrität, Selbstreferenz-, Duplikatprüfung | additiv |
| Application | `application/buildWorldFromConfig.ts` | keine Änderung erwartet (kein neuer Config-Parameter) | — |
| Presentation | `observability/EntityInspector.ts`, CLI | keine Änderung zwingend (bestehende generische `Relationships`-Ausgabe deckt `friendIds` ab) | — |
| Tests | neue Testdatei(en) analog `partnership.test.ts`; Ergänzung persistenzbezogener Tests | additiv | — |

**Nicht verändert:** `Socialize.ts`, `DecisionSystem.ts`, `PopulationSystem.ts`, `MovementSystem.ts`, `ActionExecutionSystem.ts`, `CleanupSystem.ts`.

## 24. Offene Punkte

Siehe `docs/06` Abschnitt 18 (identisch, hier nicht wiederholt): endgültige Benennung `SocialBondingSystem`/`friendIds`, empirische Entstehungshäufigkeit, eventuelle spätere Konfigurierbarkeit. Keiner dieser Punkte ist ein Blocker.

## 25. Implementierungsübergabe

Ein nachfolgender Implementierungs-Subtask kann auf Basis dieses Dokuments und `docs/06` beginnen, ohne dass weitere fachliche Grundsatzentscheidungen zu Beziehungstyp, Reziprozität, Lebenszyklus, Entstehungsmechanismus, RNG, Persistenzstrategie, Schema-Version oder Invarianten getroffen werden müssen. Offen bleiben ausschließlich redaktionelle/empirische Punkte (Abschnitt 24).
