# Subtask 9 — v2 Architektur-, Domänen- und Entscheidungsdesign

Legende: **Erkenntnis** · **Baseline-Regel** (aus v1, unveränderlich) · **Entscheidung** (verbindlich für v2) · **Annahme** (nicht abschließend validiert) · **Option** · **Bewertung** · **Risiko** · **Technische Schuld**.

---

## 1. Gesamtbefund

> **V2 ARCHITEKTUR UND DOMÄNENMODELL VERBINDLICH DEFINIERT**

Alle vier in Subtask 8 offen gelassenen Entscheidungen (Kinder-Versorgung, Partnerschaft, Gebäudeverschleiß, Jobs/Rollen) sowie die vier ergänzenden Punkte (Wood-Sink, Sozialgraph, Altersphasen, Supply/Demand-Market) wurden verbindlich getroffen. Eine bei der Ausarbeitung neu entdeckte, kritische Wechselwirkung (garantiertes Massensterben der Startpopulation durch die Kombination aus Altersgate und v1-Weltseeding) wurde identifiziert und durch eine explizite v2-Entscheidung aufgelöst (ADR-V2-06). Subtask 10 kann direkt mit der Implementierung beginnen.

---

## 2. v1-Baseline und Ausgangslage

**Baseline-Regel**: Referenz ist die tatsächliche v1-Implementierung (`src/`, Stand nach Subtask 7), nicht die ursprünglichen 01–03-Textschnipsel. Alle nachfolgenden Entscheidungen wurden gegen den tatsächlichen Code geprüft (u. a. `world/createWorld.ts`, `domain/components/age.ts`, `simulation/systems/PopulationSystem.ts`, `simulation/decision/actions/{Work,Trade}.ts`, `simulation/economy/{Market,FixedRatioMarket}.ts`, `config/schema.ts`, `persistence/schema.ts`).

Relevanter, für v2 entscheidender v1-Befund (in 01–04 nicht dokumentiert, da erst hier geprüft): `deriveLifeStage()` existiert in `domain/components/age.ts`, wird aber von **keinem** Produktionscode gelesen. Sowohl die initiale Weltpopulation (`createWorld.ts`) als auch jedes neugeborene Kind (`PopulationSystem.ts`) starten mit `ticksAlive: 0`. Diese Tatsache ist für Entscheidung 1 (Kinder-Versorgung) und ADR-V2-06 unmittelbar handlungsrelevant.

---

## 3. Verbindliche v2-Entscheidungen — Übersicht

| # | Entscheidung | Kurzfassung |
|---|---|---|
| 1 | Kinder-Versorgung | Option B — neue `Care`-Action, Person-only, ADR-14-konform |
| 2 | Partnerschaft | Option A — priorisiert, nicht zwingend; `Relationships.partnerId?` (einzelnes Feld) |
| 3 | Gebäudeverschleiß | Option B — neues `MaintenanceSystem`, self-funded aus `Building.inventory.Wood` |
| 4 | Jobs/Rollen | Option A (eingeschränkt) — optionales, unveränderliches Feld auf `Identity`, keine Rollenwechsel-Mechanik |
| 5 | Wood-Sink | identisch mit Entscheidung 3 — keine separate Mechanik |
| 6 | Sozialgraph | kein eigenständiges Component — nur `Relationships.partnerId` (identisch mit Entscheidung 2) |
| 7 | Altersphasen | genau zwei — `child`/`adult`, bestehender `deriveLifeStage()`/`minAdultAgeTicks` wiederverwendet |
| 8 | Supply/Demand Market | Ja — zweite `Market`-Implementierung, additiv wählbar über Config |
| 9 (neu entdeckt) | Initiale Weltpopulation | startet als Erwachsene, um garantiertes Massensterben ab Tick 0 zu verhindern |

Details je Entscheidung folgen in den Abschnitten 4–8.

---

## 4. Kinder-Versorgung

### Bewertung der Optionen

**Option A — keine besondere Versorgung**: Plausibilität niedrig (widerspricht dem fachlichen Ziel „sichtbare Generationenstruktur" aus Subtask 8), aber technisch trivial. **Verworfen** — liefert kein neues emergentes Verhalten, das v1 nicht schon zeigt.

**Option B — direkte Versorgung durch Eltern**: hohe Plausibilität, hohes Emergenzpotenzial (Abhängigkeit, Familienbindung sichtbar), moderate Komplexität (eine neue Action, kein neues Component). **Gewählt.**

**Option C — indirekte Versorgung über Haushalt**: würde ein neues Aggregat (Haushalt) voraussetzen — bereits in Subtask 8 als Klasse D/Out-of-Scope eingestuft. **Verworfen für v2**, da kein zusätzlicher Nutzen gegenüber Option B identifiziert wurde, der den Mehraufwand rechtfertigt.

### Entscheidung (verbindlich)

Neue Action **`Care`** (nur Person, analog zu `Work`/`Trade` nach dem ADR-14-Muster):

- **Altersbereich**: Empfänger muss `LifeStage === 'child'` sein (`ticksAlive < config.reproduction.minAdultAgeTicks`, bestehender Schwellenwert wiederverwendet — keine neue Config nötig).
- **Betroffener Need**: ausschließlich `hunger` (über Food-Transfer). `energy`/`social` benötigen keine externe Versorgung, da `Sleep`/`Socialize` keine `Inventory` voraussetzen.
- **Versorgungsquelle**: ein lebender Elternteil (`Relationships.parentIds`) mit `Inventory.amounts.Food > 0`.
- **Ausführungslogik**: `canExecute(parent, world)` — parent ist Person mit Inventory **und** besitzt mindestens ein lebendes Kind mit `LifeStage==='child'` und `hunger < 100` irgendwo in der erreichbaren Welt (Erreichbarkeit, nicht Anwesenheit — ADR-14). `requiredLocation()` liefert die Location des bedürftigsten (niedrigster `hunger`, Tie-Break niedrigste `EntityId`) co-erreichbaren Kindes. `execute()` prüft **tatsächliche** Anwesenheit von Elternteil und Kind am selben Ort und transferiert `config.actions.careTransferPerTick` Food vom Elternteil ins Kind-Inventory (begrenzt durch tatsächlichen Elternteil-Bestand, Invariante „nie negativ" bleibt gültig). `minTicks = 1` (Einzelübertragung, analog `Trade`).
- **Konkurrenz mit Work/Eat**: keine Sonderregel — `Care` konkurriert wie jede andere Action rein über `score()` (Dringlichkeit = `(100 - childHunger) / 100`, identische Formel wie `Eat`, bewusst **kein** künstlicher Prioritäts-Bonus, um keine unbegründete Magic Number einzuführen).
- **Kein verfügbarer Elternteil**: das Kind kann nicht gefüttert werden; es durchläuft exakt die bestehende `starvation`-Sterblichkeitsregel (kein neuer `DeathCause`, keine neue Mechanik — Wiederverwendung der bestehenden v1-Regel).
- **Toter Elternteil**: bleibt in `parentIds` referenziert (bestehende 03-§15-Regel, unverändert); `Care` ist für diesen Elternteil naturgemäß nicht mehr ausführbar (nicht in `entities.alive`).
- **Priorisierung**: `Care` ist **priorisiert, nicht erzwungen** — wie jede Utility-AI-Action kann sie von einem dringenderen eigenen Bedürfnis des Elternteils überboten werden. Dies ist ein bewusst akzeptiertes, dokumentiertes Risiko (Abschnitt 18).
- **Determinismus**: keine neue RNG-Nutzung (Auswahl des bedürftigsten Kindes ist eine reine, deterministische Min-Funktion mit `EntityId`-Tie-Break, analog zur bestehenden `Trade`-Gegenparteisuche).
- **Persistenz**: keine neuen Felder nötig — `Care` verändert nur bereits persistierte Felder (`Needs.hunger`, `Inventory.amounts.Food`).

---

## 5. Partnerschaft

### Bewertung der Optionen

**Option A — priorisiert, nicht zwingend**: geringes Risiko (Klasse A, keine v1-Regel gebrochen), liefert den gewünschten Effekt (wiederkehrende Paarbeziehungen über mehrere Geburten).

**Option B — zwingende Voraussetzung**: würde die in 03 §12 fixierte Regel „jedes eligible Paar gleich wahrscheinlich" ändern (Klasse C) und birgt das Risiko einer Fortpflanzungsblockade (zu wenige bereits verpartnerte Paare in einer jungen Population → Geburtenrate könnte gegen 0 fallen, bevor überhaupt Partnerschaften entstehen konnten — ein Henne-Ei-Problem).

### Entscheidung (verbindlich)

**Option A.** Option B wird explizit **abgelehnt** (Rejected, s. ADR-V2-02) — das Henne-Ei-Risiko wiegt schwerer als der zusätzliche soziale Realismus.

- **Bedeutung von `Relationships.partnerId?: EntityId`**: einzelnes, optionales Feld (nicht Array) — repräsentiert **aktuelle** Partnerschaft. Historische Partnerschaften sind nicht strukturell nachgehalten, sondern (falls benötigt) über `BirthEvent`-Historie rekonstruierbar.
- **Monogamie**: verbindlich — höchstens ein aktueller Partner gleichzeitig.
- **Gegenseitige Referenz**: verbindlich symmetrisch (`A.partnerId === B ⇔ B.partnerId === A`), atomar von `PopulationSystem` gesetzt (V2-I2, analog zur bestehenden `parentIds`/`childIds`-Symmetrie).
- **Partnerauswahl**: **kein separater Auswahlschritt.** Partnerschaft entsteht als deterministischer Nebeneffekt einer bereits erfolgreichen Fortpflanzung: Bei der bestehenden sequenziellen Paarbildung (03 §12) wird für **jede** eligible Person zuerst geprüft, ob `partnerId` gesetzt und die Referenz **lebend** ist (`entities.alive`, unabhängig von deren aktuellem Ort oder aktueller Reproduktions-Eligibilität an diesem Tick — Subtask 12, ADR-V2-02 präzisiert). Ist das der Fall, ist diese Person für die Ersatz-Paarbildung **reserviert** und nimmt an ihr in **keinem Fall** teil, auch wenn der Partner an diesem Tick nicht co-präsent oder nicht eligibel ist — es findet dann schlicht keine Fortpflanzung dieser Person an diesem Tick statt (kein Zwang, konsistent mit „priorisiert, nicht zwingend"). Nur Personen **ohne** lebenden Partner (`partnerId` fehlt **oder** verstorben, V2-I2b) durchlaufen die ursprüngliche sequenzielle Paarbildung nach `EntityId`. Führt ein **neues** (bisher unverpartnertes) Paar zu einer erfolgreichen Geburt, werden beide ab diesem Tick wechselseitig verpartnert. **Klarstellung (Subtask 12, vormals implizit und im Code abweichend umgesetzt)**: die Reservierung wirkt bereits durch das bloße Vorhandensein eines lebenden Partners — nicht erst durch dessen lokale Anwesenheit/Eligibilität an diesem Tick. Andernfalls könnte eine dritte, lokal eligible Person eine bestehende Partnerschaft faktisch ersetzen, was sowohl die Monogamie- als auch die Reziprozitätsregel (V2-I2) verletzen würde.
- **Partnerauflösung/Trennung**: **nicht Bestandteil von v2** (keine Scheidungs-/Trennungs-Action) — explizit als Out of Scope begründet (kein identifizierter Emergenz-Zugewinn, der die zusätzliche Decision-Komplexität rechtfertigt). Die obige Klarstellung ist eine unmittelbare Konsequenz dieses bereits getroffenen Ausschlusses: ein Mechanismus, der eine bestehende, lebende Partnerschaft durch eine neue ersetzen würde, wäre der Sache nach eine implizite Trennung/Scheidung und daher ebenfalls ausgeschlossen.
- **Partner-Tod**: `partnerId` bleibt auf die verstorbene Entity zeigen (kein kaskadierendes Bereinigen, konsistent mit 03 §15 — dieses Prinzip gilt hier ausdrücklich nur für den Todesfall, nicht für eine bloße Abwesenheit oder temporäre Nicht-Eligibilität eines lebenden Partners, s. o.). Für die **Eligibilität zu einer neuen Partnerschaft** gilt: eine Person ist erneut „unverpartnert" im Sinn der Pairing-Regel, wenn `partnerId` fehlt **oder** die referenzierte Entity nicht mehr in `entities.alive` ist (V2-I2b) — ermöglicht Wiederverpartnerung nach dem Tod des Partners, ohne das Feld selbst zu löschen.
- **Wiederverpartnerung**: möglich, über denselben deterministischen Mechanismus (kein Sonderfall).
- **Alters-/Geschlechtsregeln**: keine zusätzliche Regel nötig — Partnerschaft entsteht ausschließlich als Nebeneffekt einer Fortpflanzung, die bereits die bestehende Erwachsenen-/Krisenschwellen-Eligibilität voraussetzt. `Identity` besitzt kein Geschlechtsfeld — Partnerschaft ist dadurch strukturell geschlechtsneutral, ohne dass dafür eine Entscheidung nötig wäre.
- **RNG**: **kein neuer Substream.** Partnerschaftsbildung ist ein deterministischer Nebeneffekt der bereits deterministischen (`reproduction`-Substream-gestützten) Paarbildung — ein zusätzlicher Zufallszug wäre unbegründete Komplexität (ADR-V2-07).
- **Persistenz**: `Relationships.partnerId?: EntityId` wird Teil von `SaveFile` (Referenzintegrität: Plausibilität wie `parentIds`/`childIds`, keine Lebendigkeits-Pflicht, V2-I1).
- **Events**: **kein neues Event.** Partnerschaftsbildung ist zeitlich und kausal untrennbar an das bereits existierende `BirthEvent` gekoppelt; ein separates Event wäre redundant (bewusst verworfene Option, s. Abschnitt 13).

---

## 6. Gebäudeverschleiß

### Bewertung der Optionen

**Option A — Erweiterung `ProductionSystem`**: würde dessen Verantwortung von „Produktion basierend auf Umwelt" auf „Produktion **und** Zustandsverwaltung" ausweiten — Verletzung des bisher granular gehaltenen Single-Responsibility-Zuschnitts der zehn v1-Systeme.

**Option B — eigenständiges `MaintenanceSystem`**: bessere Testbarkeit (isoliert prüfbar), bessere Observability (eigener, benennbarer Verantwortungsbereich), konsistent mit dem granularen v1-Zuschnitt.

### Entscheidung (verbindlich)

**Option B.** Neues System **`MaintenanceSystem`**, Perception-Phase, Position: nach `WeatherSystem`, **vor** `ProductionSystem` (damit der für diesen Tick aktuelle Zustand die Produktion desselben Ticks beeinflusst — analog dazu, dass `WeatherSystem` vor `ProductionSystem` läuft).

- **Neues Feld**: `Building.condition?: number` (0–100, geklemmt wie `Needs`) — **nur** für Gebäude mit definierter Produktionszuordnung (`Field`→Food, `Workplace`→Wood; V2-I5). `House`/`Market` erhalten **kein** `condition`-Feld (kein ungenutztes Feld, konsistent mit dem in Subtask 3.6b etablierten Prinzip).
- **Verschleiß**: `condition -= config.maintenance.conditionDecayPerTick` pro Tick, geklemmt bei 0 — reine Arithmetik, kein RNG (analog Needs-Zerfall).
- **Reparatur/Wood-Sink** (identisch mit Entscheidung „Wood-Sink", Abschnitt 8.1): **kein neuer Agent-Action** — `MaintenanceSystem` entnimmt automatisch bis zu `config.maintenance.woodPerConditionPoint × benötigte Punkte` aus **dem Wood-Bestand desselben Gebäudes** (`Building.inventory.Wood`) und erhöht `condition` entsprechend, begrenzt durch tatsächlichen Bestand (Invariante „nie negativ" bleibt gültig). Ein `Workplace` finanziert seine eigene Instandhaltung aus seinem eigenen Wood-Ertrag; ein `Field` hat i. d. R. keinen eigenen Wood-Bestand und verschleißt daher tendenziell stärker, sofern nicht durch `Work`-Extraktion an anderer Stelle ausgeglichen — eine bewusst akzeptierte, plausible Asymmetrie.
- **Auswirkung auf Produktion**: `ProductionSystem` multipliziert den bestehenden Season-/Weather-Faktor zusätzlich mit `max(config.maintenance.minProductionMultiplier, condition / 100)` für Gebäude mit `condition`-Feld (V2-I6 — nie unter dem konfigurierten Minimum, verhindert dauerhaften, irreversiblen Totalausfall).
- **Warum kein Agent-Action („Maintain"/„Repair")**: geprüft und verworfen (ADR-V2-03) — eine agentengesteuerte Reparatur-Action würde `Work` strukturell duplizieren (Reise, Anwesenheit, Ressourcentransfer) ohne einen ausreichend eigenständigen Emergenzgewinn gegenüber dem einfacheren, automatischen Selbstfinanzierungsmodell zu liefern; zusätzliche Decision-/Test-/RNG-Oberfläche wäre unbegründete Komplexität.
- **Events**: neues `BuildingConditionChangedEvent` (Details Abschnitt 13) — **nur** bei Bandwechsel, nicht bei jedem Tick (analog `WeatherChangedEvent`/`SeasonChangedEvent`).
- **Konfiguration**: neuer Block `maintenance: { conditionDecayPerTick: number; woodPerConditionPoint: number; minProductionMultiplier: number }` (Details Abschnitt 20).
- **Persistenz**: `Building.condition` wird Teil von `SaveFile.world.environment.buildings` (V2-I9).

---

## 7. Jobs/Rollen

### Bewertung der Optionen

**Option A — Feld auf `Identity`**: passt zu einer **unveränderlichen** Zuweisung (Identity ist laut 02 §3 „unveränderlich nach Erzeugung"); keine zusätzliche Component-Fragmentierung.

**Option B — eigenes `Role`-Component**: wäre nötig, **falls** Rollen zur Laufzeit wechselbar sein sollen (mutabler Zustand passt nicht zu `Identity`).

### Entscheidung (verbindlich, eingeschränkter Umfang)

**Option A**, mit explizit eingeschränktem Umfang: **kein Rollenwechsel in v2.**

- **Rolle(n)**: `Identity.role?: 'Farmer' | 'Lumberjack'` (optional; `undefined` = Generalist, entspricht exakt dem bisherigen v1-Verhalten — vollständig rückwärtskompatibel zu unkonfigurierten v1-artigen Welten).
- **Default-Rolle**: `undefined` (Generalist).
- **Rollenwechsel**: **nicht Bestandteil von v2** — genau deshalb ist Option A (statt eines mutablen Components) korrekt gewählt; eine Wechsel-Mechanik wäre für v2 unbegründete zusätzliche Komplexität (Subtask 8 stufte Jobs/Rollen bereits als „Should Have" mit geringerem Emergenzgewinn ein).
- **Zuordnung zu Work**: `Work`s bestehende Zielauswahl (`chooseWorkTarget`) bevorzugt bei Gleichstand nicht mehr nur die niedrigste `BuildingId`, sondern zuerst ein Gebäude, dessen produzierter Rohstoff der Rolle entspricht (`Farmer`→`Field`, `Lumberjack`→`Workplace`); Generalisten und alle anderen Tie-Break-Fälle verhalten sich exakt wie in v1.
- **Auswirkung auf Decision Scores**: keine Änderung der Score-Formel selbst — nur der Ziel**auswahl** innerhalb von `Work`, nicht der Dringlichkeit.
- **Auswirkung auf Ressourcenproduktion**: keine direkte (Rolle beeinflusst nur, **wohin** eine Person zum Arbeiten geht, nicht die Produktionsrate des Gebäudes selbst).
- **Zuweisung**: ausschließlich für die **initiale** Weltpopulation, über einen neuen optionalen Config-Block `initialPopulation.roles?: { farmers: number; lumberjacks: number }` (explizite Stückzahlen, analog zu `humans`/`animals`, keine Wahrscheinlichkeit, kein neuer RNG-Bedarf). **Neugeborene erhalten nie eine Rolle** (immer Generalist) — bewusst einfache, klar abgegrenzte Regel.
- **Persistenz**: `Identity.role` wird Teil von `SaveFile` (optionales Feld, wie `species`).
- **Events**: keine — Rollenzuweisung ist kein Laufzeitereignis (nur Welterzeugung).

---

## 8. Weitere v2-Entscheidungen

### 8.1 Wood-Sink

**Entscheidung**: identisch mit Abschnitt 6 — der Wood-Sink **ist** die Gebäude-Selbstinstandhaltung, keine separate Mechanik. Größenordnung (`woodPerConditionPoint`, `conditionDecayPerTick`): siehe Konfigurationsabschnitt — bewusst konservativ gewählt (langsamer Verschleiß), um das in Subtask 5 beobachtete Doppel-Knappheits-Risiko (Food **und** Wood gleichzeitig knapp) nicht zu verschärfen (Annahme, empirisch in einem künftigen v2-Analog zu Subtask 5 zu prüfen). Betroffene Systeme: `MaintenanceSystem` (neu), `ProductionSystem` (liest `condition` zusätzlich).

### 8.2 Sozialgraph

**Entscheidung**: **kein** eigenständiges `SocialGraph`-Component. `Relationships` wird um genau ein Feld (`partnerId?`) erweitert (Abschnitt 5). Freundschaft/allgemeine soziale Beziehungen jenseits von Partnerschaft und Eltern-Kind bleiben **Out of Scope** (Subtask 8 fand keinen hinreichenden v1-Befund, der dies zwingend macht).

### 8.3 Altersabhängiges Verhalten

**Entscheidung**: genau **zwei** Phasen — `child` (`ticksAlive < minAdultAgeTicks`) und `adult` (sonst), unter Wiederverwendung des bereits existierenden `deriveLifeStage()` und des bestehenden `minAdultAgeTicks`-Schwellenwerts (keine neue Config). **Keine** `Adolescent`/`Elder`-Phase — für keine davon wurde ein konkretes, eigenständiges Verhalten identifiziert, das die zusätzliche Phase rechtfertigen würde.

| Phase | Needs | Eat | Sleep | Socialize | Work | Trade | Care (als Akteur) | Reproduktion | Movement | Sterblichkeit |
|---|---|---|---|---|---|---|---|---|---|---|
| `child` | unverändert | unverändert (`canExecute` benötigt weiterhin `Food>0`, i. d. R. nur über `Care` erreichbar) | unverändert | unverändert | **`canExecute` → false (neu, V2-I3)** | **`canExecute` → false (neu, V2-I3)** | nicht möglich (kein eigenes Food-Einkommen) | ausgeschlossen (bereits v1-Regel, unverändert) | unverändert | unverändert (Mechanismus identisch, Risiko s. Abschnitt 18) |
| `adult` | unverändert | unverändert | unverändert | unverändert | unverändert | unverändert | möglich, falls eigenes Kind vorhanden | wie v1 (ggf. + Partnerschaft-Nebeneffekt) | unverändert | unverändert |

---

## 9. Neue Domänenstruktur

| Element | Zweck | Felder | Invarianten | Verantwortlichkeit | Lebenszyklus | Persistiert | Beziehung zu Bestehendem |
|---|---|---|---|---|---|---|---|
| `Relationships` (erweitert) | + aktuelle Partnerschaft | `+ partnerId?: EntityId` | V2-I1, V2-I2, V2-I2b | `PopulationSystem` | wie bisher (Person, ab Geburt) | ja | Erweiterung, kein Ersatz |
| `Identity` (erweitert) | + optionale Rolle | `+ role?: 'Farmer' \| 'Lumberjack'` | keine neue (rein additiv, unveränderlich) | Welterzeugung (nur initial) | wie bisher (unveränderlich) | ja | Erweiterung, analog `species` |
| `Building` (erweitert) | + Zustand | `+ condition?: number` | V2-I4, V2-I5 | `MaintenanceSystem`, `ProductionSystem` (lesend) | wie bisher (statisch, Feld mutiert) | ja | Erweiterung, nur für Field/Workplace |
| `Care`-Action (neu) | Kinder-Versorgung | — (keine neuen Felder, nur bestehende Actions-Config) | V2-I8 | `ActionExecutionSystem` (Dispatch), `DecisionSystem` (Auswahl) | wie jede Action | Fortschritt über `AIState` | analog `Work`/`Trade` |
| `MaintenanceSystem` (neu) | Gebäudeverschleiß/-instandhaltung | — | V2-I4, V2-I5, V2-I6 | eigenständiges System, Perception-Phase | pro Tick | — (System selbst zustandslos) | liest/schreibt `Building.condition`/`inventory` |
| `SupplyDemandMarket` (neu) | zweite Market-Strategie | keine eigene, persistente Instanzvariable (zustandslos, s. Abschnitt 8.4) | V2-I7 | `Trade`-Action (via `Market`-Interface) | pro Aufruf | — (rein funktional über `WorldState`) | zweite Implementierung von `Market` |

`Needs`, `Age`, `AIState`, `Inventory` bleiben **strukturell unverändert** — ihre Semantik wird nur durch die neuen Regeln (Alters-Gate, Care) beeinflusst, nicht ihre Form.

### 8.4 Supply/Demand Market — Entscheidung

**Ja**, Bestandteil von v2 — additiv wählbar (`config.economy.market: 'FixedRatio' | 'SupplyDemand'`), `FixedRatioMarket` bleibt unverändert Default.

- **Angebot/Nachfrage-Proxy**: aggregierte, bereits über `WorldState` verfügbare Bestände (Summe `Inventory.amounts` aller Personen **plus** `Building.inventory` aller Gebäude je Ressourcentyp) — kein neuer, separat zu pflegender Marktzustand.
- **Preisbildung**: `effectiveRatio = clamp(baseRatio × (totalWood / totalFood)^elasticity, minRatio, maxRatio)` — deterministisch, kein RNG.
- **Determinismus**: vollständig aus bereits persistiertem `WorldState` ableitbar — kein neuer Zustand, kein Save/Load-Risiko.
- **Architekturfolge (Breaking Change, Signatur, nicht Verhalten)**: `Market.quote()` wird um einen dritten Parameter erweitert: `quote(resource: ResourceType, amount: number, world: WorldStateReader): number`. `FixedRatioMarket.quote()` erhält denselben Parameter, **ignoriert** ihn — Verhalten von `FixedRatioMarket` bleibt zu 100 % identisch zu v1. Kein bestehender Aufrufer außerhalb der Market-Implementierungen selbst ruft `quote()` auf (verifiziert gegen v1 — nur `FixedRatioMarket.trade()` nutzt es intern), daher ist dies die einzige betroffene Signatur.
- **Persistenz**: keine neuen Felder.
- **Events**: keine neuen — `TradeEvent.price` bildet den zum Zeitpunkt des Trades geltenden Preis bereits ab, unabhängig von der Market-Implementierung.

---

## 10. Invarianten (V2-I1 bis V2-I9)

| # | Invariante | Wo erzwungen | Testbar als |
|---|---|---|---|
| V2-I1 | `Relationships.partnerId`, falls gesetzt, referenziert eine plausible `EntityId` (`< nextEntityId`) | `persistence/deserialize.ts` (Referenzintegrität) | Persistenz-Test: ungültiger `partnerId` → `ValidationError` |
| V2-I2 | **Standing-Invariante, jederzeit** (nicht nur unmittelbar nach Zuweisung): für jede lebende Person A mit `A.partnerId === B` gilt `B` lebt und `B.partnerId === A` — unabhängig von Ort, Reisezustand oder aktueller Reproduktions-Eligibilität beider Personen. Eine bestehende, lebende Partnerschaft darf durch keinen Mechanismus einseitig durch eine dritte Person ersetzt werden (Subtask 12, ADR-V2-02 präzisiert; zuvor mehrdeutig zwischen dieser Zeile und §5 formuliert und im Code abweichend — überrestriktiv — umgesetzt, s. Subtask-11/12-Berichte) | `PopulationSystem` (`buildPairs`: Reservierung anhand `entities.alive`, nicht anhand lokaler Eligibilität; atomare Zuweisung in `formPartnership`) | Standing-Invariant-Test über mehrere Ticks mit Ortswechsel/temporärer Nicht-Eligibilität (nicht nur unmittelbar nach einer Geburt) |
| V2-I2b | Eine Person ist „unverpartnert" im Pairing-Sinn (= nimmt an der sequenziellen Ersatz-Paarbildung teil), wenn `partnerId` fehlt **oder** die Referenz nicht in `entities.alive` ist — **und in keinem weiteren Fall** (insbesondere nicht bei bloßer Abwesenheit oder temporärer Nicht-Eligibilität eines lebenden Partners) | `PopulationSystem` (Eligibilitätsprüfung, ausschließlich `aliveSet`-basiert) | Unit-Test: Wiederverpartnerung nach Partner-Tod; zusätzlich negativ: **keine** Wiederverpartnerung bei lebendem, nur ortsabwesendem/temporär nicht-eligiblem Partner |
| V2-I3 | `Work.canExecute()`/`Trade.canExecute()` liefern für `LifeStage==='child'` stets `false` | jeweilige Action | Unit-Test je Action, Person mit `ticksAlive < minAdultAgeTicks` |
| V2-I4 | `Building.condition`, falls vorhanden, ist stets auf `[0,100]` geklemmt | `MaintenanceSystem` | Unit-Test: Über-/Unterschreitung wird geklemmt |
| V2-I5 | `Building.condition` existiert genau dann, wenn `kind ∈ {Field, Workplace}` | Welterzeugung (v2), `MaintenanceSystem` | Unit-Test: `House`/`Market` ohne `condition`-Feld |
| V2-I6 | Der Produktions-Multiplikator eines Gebäudes mit `condition` unterschreitet nie `config.maintenance.minProductionMultiplier` | `ProductionSystem` | Unit-Test: `condition=0` → Multiplikator = `minProductionMultiplier`, nicht 0 |
| V2-I7 | `SupplyDemandMarket`-Preise liegen stets in `[minRatio, maxRatio]` | `SupplyDemandMarket.quote()` | Unit-Test: extreme Bestandsverhältnisse bleiben geklemmt |
| V2-I8 | `Care.execute()` transferiert nur zwischen einer lebenden, tatsächlich anwesenden Eltern-Kind-Paarung | `Care`-Action, `execute()` | Unit-Test analog bestehender `Work`/`Trade`-ADR-14-Tests |
| V2-I9 | Alle neuen v2-Felder (`partnerId`, `role`, `condition`) sind vollständig Teil von `SaveFile` und überleben Save→Load exakt | `persistence/schema.ts`, `serialize.ts`/`deserialize.ts` | Persistenz-Test analog bestehendem Save/Load-Rundreise-Test |

Bestehende v1-Invarianten (I1–I8, 03 §14) bleiben **unverändert** gültig und werden durch keine v2-Entscheidung berührt.

---

## 11. Architektur

### Neue/geänderte Systeme

| System | Verantwortung | Input | Output/mutiert | Events | Config | Tick-Position |
|---|---|---|---|---|---|---|
| `MaintenanceSystem` (neu) | Gebäudeverschleiß/-instandhaltung | `Building.condition`, `Building.inventory.Wood` | `Building.condition`, `Building.inventory.Wood` | `BuildingConditionChangedEvent` (bei Bandwechsel) | `maintenance.*` | Perception, nach `WeatherSystem`, vor `ProductionSystem` |
| `ProductionSystem` (erweitert) | wie v1 + Verschleiß-Multiplikator | + `Building.condition` (lesend) | unverändert | unverändert | unverändert | unverändert (Perception, nach `MaintenanceSystem`) |
| `PopulationSystem` (erweitert) | wie v1 + Partnerschafts-Nebeneffekt | + `Relationships.partnerId` (lesend/schreibend) | + `Relationships.partnerId` | unverändert (kein neues Event, s. Abschnitt 5) | unverändert | unverändert (Resolution) |
| `DecisionSystem`/`ActionExecutionSystem` | unverändert, jetzt mit 6 statt 5 Actions | unverändert | unverändert | unverändert | unverändert | unverändert |

### Aktualisierte konzeptionelle Tick-Reihenfolge

```
Perception:  TimeSystem → WeatherSystem → MaintenanceSystem (neu) → ProductionSystem → NeedsSystem
Decision:     DecisionSystem (6 Actions: Eat, Sleep, Socialize, Work, Trade, Care)
Action:       MovementSystem → ActionExecutionSystem
Resolution:   PopulationSystem (+ Partnerschafts-Nebeneffekt) → EventResolutionSystem
Cleanup:      CleanupSystem
```

Keine zyklischen Abhängigkeiten: `MaintenanceSystem` liest/schreibt ausschließlich `Building`-Zustand (dieselbe Datenkategorie wie `ProductionSystem`, keine neue Kopplungsrichtung); `Care`/Rollen-Logik lesen ausschließlich bereits existierende `Relationships`/`Identity`-Daten. Keine neuen Ports/Interfaces erforderlich (bestätigt gegenüber Subtask 8s Einschätzung) — mit **einer** Ausnahme: die Signaturerweiterung von `Market.quote()` (Abschnitt 8.4), die keinen neuen Port, sondern eine erweiterte bestehende Schnittstelle darstellt.

---

## 12. Actions und Decision-System

Neue Action: **`Care`** (Details Abschnitt 4). Keine weiteren neuen Actions (Prädation/Hunt bleibt Out of Scope, Abschnitt 25).

| | `canExecute` | `score` | `requiredLocation` | `execute` | Reise möglich | `minTicks` | Ressourcenwirkung |
|---|---|---|---|---|---|---|---|
| `Care` | Person, hat Food, hat erreichbares bedürftiges Kind | `(100 − bedürftigstes Kind.hunger) / 100` | Location des bedürftigsten Kindes | prüft Anwesenheit, transferiert Food | ja (ADR-14) | 1 | `Inventory.Food` (Eltern) → `Inventory.Food` (Kind) |

**ADR-14 bleibt für `Care` vollständig verbindlich** — Anwesenheit ist Ausführungs-, nicht Auswahlvoraussetzung, exakt wie bei `Work`/`Trade`. Kein Architekturkonflikt identifiziert.

`Work`/`Trade` erhalten für `canExecute()` eine zusätzliche, vorgeschaltete Bedingung (`LifeStage !== 'child'`, V2-I3) — dies ist eine **Erweiterung**, keine Änderung ihrer ADR-14-Konformität (die Anwesenheitsregel selbst bleibt unangetastet).

---

## 13. Event-Modell

Geprüft, ob eine Erweiterung der sieben bestehenden Event-Typen ausreicht: **nein**, für Gebäudezustand fehlt eine Entsprechung zu `WeatherChangedEvent`/`SeasonChangedEvent`. Für alle anderen neuen Mechaniken (Care, Partnerschaft, Rollen) wurde eine Event-Notwendigkeit geprüft und **verneint** (Begründung je Fall oben in Abschnitten 4/5/7).

### Neues Event: `BuildingConditionChangedEvent`

| Feld | Typ | Bedeutung |
|---|---|---|
| `type` | `'BuildingConditionChangedEvent'` | — |
| `sequence`, `tick` | wie alle Events | — |
| `buildingId` | `BuildingId` | betroffenes Gebäude |
| `condition` | `number` | aktueller Wert |
| `band` | `'healthy' \| 'degraded' \| 'critical'` | Bandwechsel-Richtung |

**Ursache**: `MaintenanceSystem`, Bandübergang (Schwellenwerte konfigurierbar, s. Abschnitt 20). **Zeitpunkt**: Perception-Phase, vor `ProductionSystem` desselben Ticks. **Auswertbarkeit**: erklärt einen späteren Abfall der `HarvestEvent.amount`-Werte desselben Gebäudes — direkte Observability-Anforderung (Abschnitt 17). Kein redundantes Event zu einem bestehenden Typ.

---

## 14. RNG und Determinismus

| Neue Zufallsentscheidung? | Ergebnis |
|---|---|
| Partnerauswahl | **kein RNG-Bedarf** — deterministischer Nebeneffekt der bestehenden `reproduction`-Paarbildung (ADR-V2-07) |
| Sozialauswahl (bedürftigstes Kind für `Care`) | **kein RNG-Bedarf** — deterministische Min-Funktion mit `EntityId`-Tie-Break |
| Gebäudeverschleiß/-instandhaltung | **kein RNG-Bedarf** — reine Arithmetik, analog Needs-Zerfall |
| `SupplyDemandMarket`-Preisbildung | **kein RNG-Bedarf** — reine Funktion über `WorldState`-Bestände |
| Rollenzuweisung | **kein RNG-Bedarf** — explizite Config-Stückzahlen, nur bei Welterzeugung |
| Prädation | entfällt (Out of Scope) |

**Ergebnis**: v2 führt in der hier entschiedenen Ausbaustufe **keinen einzigen neuen RNG-Substream** ein. Dies ist kein Zufall, sondern Konsequenz der bewussten Entscheidung, jede neue Mechanik so zu gestalten, dass sie entweder rein deterministisch ist oder einen bereits deterministischen bestehenden Mechanismus (Fortpflanzungs-Paarbildung) mitnutzt. Bestehende Substreams (`weather`, `production`, `reproduction`, `agent-decision`, `agent-action`) bleiben unverändert und werden durch keine v2-Regel neu belegt.

---

## 15. Persistenz

| Element | Neu/geändert | Schema-Ort | Referenzintegrität | Defaulting bei Load |
|---|---|---|---|---|
| `Relationships.partnerId?` | neu | `persistence/schema.ts`, Component-Entries | V2-I1 (Plausibilität) | fehlt → `undefined` |
| `Identity.role?` | neu | wie oben | keine (kein Referenzfeld) | fehlt → `undefined` |
| `Building.condition?` | neu | `environment.buildings` | V2-I5 (nur Field/Workplace) | fehlt bei falschem `kind` → Validierungsfehler |
| `schemaVersion` | geändert | `SaveFile.schemaVersion` | strikte Gleichheitsprüfung (unverändert, ADR-10) | — |

**ADR-10 bleibt unverändert**: kein Migrationspfad. Der `schemaVersion`-Bump auf `2` bedeutet, dass v1-Spielstände beim Laden mit einer v2-Engine korrekt und erwartungsgemäß mit `PersistenceError` abgelehnt werden — exakt das in v1 bereits dokumentierte, gewollte Verhalten bei einer Strukturänderung, kein neuer Mechanismus.

---

## 16. Konfiguration

| Feld | Typ | Default (Annahme) | Bedeutung | Wertebereich | Determinismus/Persistenz |
|---|---|---|---|---|---|
| `actions.careTransferPerTick` | `number` | `10` | Food-Menge je `Care`-Ausführung | `≥ 0` | keine RNG-Auswirkung; Teil von `config` in `SaveFile` |
| `maintenance.conditionDecayPerTick` | `number` | `0.2` | Verschleiß pro Tick | `≥ 0` | wie oben |
| `maintenance.woodPerConditionPoint` | `number` | `1` | Wood-Kosten je Reparaturpunkt | `> 0` | wie oben |
| `maintenance.minProductionMultiplier` | `number` | `0.2` | Untergrenze des Produktions-Multiplikators | `[0,1]` | wie oben |
| `economy.market` | `'FixedRatio' \| 'SupplyDemand'` | `'FixedRatio'` | gewählte Market-Strategie | Enum | keine RNG-Auswirkung |
| `economy.supplyDemand.elasticity` | `number` | `0.5` | Preiselastizität | `≥ 0` | wie oben |
| `economy.supplyDemand.minRatio`/`maxRatio` | `number` | `0.5` / `4` | Preisgrenzen (V2-I7) | `minRatio < maxRatio` | wie oben |
| `initialPopulation.roles?.farmers`/`lumberjacks` | `number` | `0`/`0` (kein Default-Verhalten ggü. v1) | initiale Rollenzuordnung | `≥ 0`, Summe `≤ initialPopulation.humans` | nur Welterzeugung, keine RNG-Auswirkung |

Alle Default-Werte sind **Annahmen** (bewusst konservativ, insbesondere `maintenance.*`, um das in Abschnitt 18 analysierte Doppel-Knappheits-Risiko zu begrenzen) — endgültige Kalibrierung erfolgt empirisch (analog Subtask 5), nicht in diesem konzeptionellen Subtask. Keine Magic Numbers im Code — jeder Wert kommt über `SimulationConfig` (Fortführung der bestehenden v1-Regel, 02 §17).

---

## 17. Observability

Für jede neue Mechanik wurde geprüft, ob ein Entwickler den entstandenen Zustand über Events/Inspect/Stats erklären kann:

- **Care**: Wirkung sichtbar über `inspect` (Inventory-/Needs-Änderung von Eltern und Kind), analog zu `Work` (keine Lücke, kein neues Event nötig).
- **Partnerschaft**: sichtbar über `inspect` (`Relationships.partnerId`) und den zeitlich gekoppelten `BirthEvent`.
- **Rollen**: sichtbar über `inspect` (`Identity.role`), rein statisch, keine Nachvollziehbarkeit zur Laufzeit nötig.
- **Gebäudeverschleiß**: **Lücke identifiziert** — v1 besitzt **keine** CLI-/Observability-Möglichkeit, ein `Building` direkt zu inspizieren (`inspect` deckt ausschließlich Entities ab, 02 §14/§18). Ohne Gegenmaßnahme wäre ein sinkender `HarvestEvent.amount`-Trend nicht auf seine Ursache (Verschleiß) zurückführbar.

**Entscheidung**: `BuildingConditionChangedEvent` (Abschnitt 13) schließt diese Lücke für die **diskreten** Bandwechsel. Zusätzlich wird empfohlen (Subtask 10, nicht hier verbindlich vorgeschrieben, da reine Werkzeug-Erweiterung ohne Domänenwirkung): `StatisticsReporter`/CLI um eine Building-Übersicht zu ergänzen. Dies ist **keine Domänenentscheidung**, sondern eine Observability-Ergänzung, die die bestehende `EntityInspector`-Symmetrie für `Building` nachzieht.

---

## 18. Emergenz- und Stabilitätsanalyse

### Kritischer Befund (nicht in Subtask 8 vorhergesehen): garantiertes Massensterben der Startpopulation

Da sowohl die initiale Weltpopulation als auch Neugeborene in v1 mit `ticksAlive: 0` starten (bestätigter v1-Befund, Abschnitt 2), würde die Kombination „Altersgate auf Work/Trade" + „unveränderte v1-Weltseeding-Logik" dazu führen, dass **die gesamte Startpopulation** bei Welterzeugung sofort als `child` gilt, während `Relationships.parentIds` für sie leer ist — es gäbe **niemanden**, der sie via `Care` versorgen könnte. Ergebnis: garantiertes, nicht-emergentes (weil strukturell unausweichliches) Massensterben ab den ersten `starvationDeathThresholdTicks` Ticks, unabhängig von jeder Parametrisierung.

**Auflösung (ADR-V2-06, verbindlich)**: Die v2-Weltseeding-Logik (Subtask 10) initialisiert alle **initial** erzeugten Personen mit `ticksAlive = config.reproduction.minAdultAgeTicks` (statt `0`) — sie starten als gerade-erwachsen. **Nur** durch Fortpflanzung geborene Personen starten weiterhin mit `ticksAlive: 0` als `child`. Dies ist eine v2-spezifische Entscheidung für die Weltseeding-Logik, **keine** Änderung der eingefrorenen v1-`createWorld.ts` selbst (die für v1-Konfigurationen ohne aktives Altersgate unverändert bleibt).

### Wood-Sink / Gebäudeverschleiß
- **Positive Rückkopplung**: mehr Population → mehr `Work` am Workplace → mehr Wood-Produktion, aber auch mehr Wood-Extraktion (weniger verbleibt für Instandhaltung) — durch endliche Gebäudezahl begrenzt.
- **Negative Rückkopplung**: sinkende `condition` → sinkende Produktion → weniger Wood verfügbar → verstärkter Verschleiß, aber durch `minProductionMultiplier` (V2-I6) nach unten begrenzt — **kein permanenter Totalausfall möglich**.
- **Risiko**: Doppel-Knappheit (Food **und** Wood gleichzeitig knapp), verschärft den in Subtask 5 (Szenario B2) beobachteten Starvation-Cluster-Effekt. **Gegenmaßnahme**: konservative Default-Parametrisierung (Abschnitt 16); endgültige Validierung empirisch, nicht hier abschließend entschieden.

### Care / Kinder-Versorgung
- **Risiko**: da `Care` priorisiert, nicht erzwungen ist, könnten Kinder verhungern, wenn Eltern ihre eigenen Bedürfnisse dauerhaft höher gewichten (insbesondere unter der oben beschriebenen Doppel-Knappheit). Dies ist ein **bewusst akzeptiertes, dokumentiertes Risiko** — keine künstliche Erzwingung von `Care` (würde dem Utility-AI-Prinzip widersprechen). Beobachtungspunkt für eine künftige empirische v2-Validierung.

### Partnerschaft
- **Risiko**: gering, da rein additiv/priorisierend — im ungünstigsten Fall entstehen schlicht keine dauerhaften Partnerschaften (Verhalten fällt auf reines v1-Pairing zurück), kein Kollaps- oder Blockade-Szenario möglich (im Unterschied zur verworfenen Option B).

### Rollen
- **Risiko**: vernachlässigbar — reine Zielauswahl-Präferenz ohne Rückkopplungscharakter.

### Supply/Demand Market
- **Risiko**: Preis-Oszillation bei knappen Beständen — durch `minRatio`/`maxRatio` (V2-I7) hart begrenzt, kein Runaway möglich.

---

## 19. Teststrategie für v2

### Pflicht — nachzuziehende v1-Integrationstests (technische Schuld #1, vor neuer v2-Logik)
1. Hunger → `Eat`-Entscheidung → `Eat`-Ausführung über die echte Tick-Schleife.
2. Produktion → Arbeit → Handel → Konsum über mehrere echte Ticks.
3. Geburt → Population → Tod durch Hunger → Cleanup über die echte Tick-Schleife.

### Neue v2-Regeln
- **Unit**: `Care` (canExecute/score/requiredLocation/execute, analog bestehender Action-Tests), `MaintenanceSystem` (Verschleiß, Klemmung, Multiplikator-Untergrenze), `SupplyDemandMarket` (Preisberechnung, Klemmung), Rollen-Zielauswahl in `Work`, Alters-Gate in `Work`/`Trade`.
- **Integration**: vollständiger Care-Zyklus über die Tick-Schleife (Kind wird geboren, verhungert nicht, solange ein Elternteil verfügbar ist); Partnerschaftsbildung über mehrere Ticks/Geburten.
- **Determinismus**: die drei bestehenden Determinismus-Tests (02 §19) werden um v2-Konfigurationen ergänzt (gleicher Seed → identisches Ergebnis, auch mit aktivierten v2-Mechaniken).
- **Persistenz**: Save/Load-Rundreise mit gesetzten `partnerId`/`role`/`condition`-Feldern.
- **Regression**: alle bestehenden 70 v1-Tests müssen unverändert grün bleiben (v1-Verhalten bei v1-typischer Config, d. h. ohne aktivierte v2-Optionen, bleibt identisch).
- **Emergenz/Langzeitverhalten**: ein v2-Analog zu Subtask 5 (nicht Bestandteil von Subtask 10 selbst, aber vorzusehen) zur Prüfung der in Abschnitt 18 benannten Risiken.

---

## 20. Technische Schulden

| # | Schuld | Entscheidung für v2 |
|---|---|---|
| 1 | fehlende Integrationstests (02 §19) | **wird in v2 behoben** — verpflichtend, vor neuer v2-Implementierung (Abschnitt 19) |
| 2 | fehlende Unit-Tests für 8 Systeme | **teilweise behoben** — die durch v2 erweiterten/neuen Systeme (`MaintenanceSystem`, `PopulationSystem`, `DecisionSystem`/`ActionExecutionSystem` via `Care`) erhalten Tests; die übrigen, unveränderten v1-Systeme (`TimeSystem`, `WeatherSystem`, `MovementSystem`, `EventResolutionSystem`, `CleanupSystem`) bleiben **bewusst weiter verschoben**, da v2 ihre Logik nicht berührt |
| 3 | CLI-Validierungslücke (`--ticks`) | **bleibt bestehen** — bewusst weiter verschoben, kein Bezug zu v2-Fachlogik |
| 4 | Dev-Dependency-Schwachstellen | **bleibt bestehen** — bewusst weiter verschoben, eigenständiges Tooling-Vorhaben |
| 5 | fehlende Coverage-Infrastruktur | **bleibt bestehen** — bewusst weiter verschoben, kein Muss für v2 |

Keine Schuld verschwindet stillschweigend.

---

## 21. v2-Scope (final)

| Feature | Entscheidung | v2? | Priorität | Begründung | Abhängigkeiten |
|---|---|---:|---|---|---|
| `Care`-Action (Kinder-Versorgung) | Abschnitt 4 | ja | MUST | schließt garantierte Versorgungslücke, Voraussetzung für Altersgate | ADR-V2-06 (Weltseeding) |
| Altersabhängiges Verhalten (`Work`/`Trade`-Gate) | Abschnitt 8.3 | ja | MUST | zentrales v2-Ziel „Generationenstruktur" | `Care`, ADR-V2-06 |
| v2-Weltseeding (Erwachsene initial) | ADR-V2-06 | ja | MUST | verhindert garantierten Kollaps | — |
| Nachziehen der 3 v1-Integrationstests | Abschnitt 19 | ja | MUST | technische Schuld #1, Testbasis vor v2-Wachstum sichern | — |
| Gebäudeverschleiß / Wood-Sink | Abschnitt 6/8.1 | ja | MUST | behebt empirisch belegte v1-Ressourcen-Unbalance | `MaintenanceSystem` |
| Partnerschaft (priorisiert) | Abschnitt 5 | ja | SHOULD | erhöht Glaubwürdigkeit, geringes Risiko | `Care` (thematisch verwandt, keine harte Abhängigkeit) |
| `SupplyDemandMarket` | Abschnitt 8.4 | ja | SHOULD | von 02 §11 bereits vorgesehene Erweiterung, additiv | — |
| Jobs/Rollen (nur initial) | Abschnitt 7 | ja | SHOULD | Glaubwürdigkeit, geringes Emergenzpotenzial | — |
| Unit-Tests für neue/erweiterte Systeme | Abschnitt 19 | ja | SHOULD | Testbasis nicht verschlechtern | jeweiliges Feature |
| Prädator/Beute | Subtask 8 | nein | COULD | hohes Kollapsrisiko, kein v1-Befund erzwingt es | — |
| Krankheitssystem | 01 §3.2 | nein | COULD | kein konkreter v1-Befund, hoher Aufwand | — |
| Dashboard/UI | 01 §3.2 | nein | COULD | reines Tooling, kein Simulationsverhalten | — |
| Coverage-Tooling | Subtask 6 | nein | COULD | keine v2-Fachlogik betroffen | — |
| Größerer/dynamischer Weltgraph | Subtask 8 | nein | COULD | ändert `PathTable`-Grundannahme (Klasse C) | — |
| Partnerschaft als Pflicht | Abschnitt 5 | **nein** | — | explizit verworfen (Henne-Ei-Risiko) | — |
| Rollenwechsel-Mechanik | Abschnitt 7 | nein | OUT OF SCOPE | unbegründete Zusatzkomplexität | — |
| Partnertrennung/Scheidung | Abschnitt 5 | nein | OUT OF SCOPE | kein identifizierter Emergenzgewinn | — |
| Haushalte als Aggregat | Subtask 8 | nein | OUT OF SCOPE | Klasse D, zu tiefgreifend | — |
| Echter Migrationspfad | Abschnitt 15 | nein | OUT OF SCOPE | ADR-10 bleibt bestehen | — |
| Dependency-Graph-Systemplanung | ADR-11 (v1) | nein | OUT OF SCOPE | weiterhin zurückgestellt | — |
| Event-Reaktionsketten/Pub-Sub | ADR-06 (v1) | nein | OUT OF SCOPE | weiterhin abgelehnt | — |

---

## 22. ADRs

**ADR-V2-01 — Kinder-Versorgung über neue `Care`-Action**
Status: Accepted. Kontext: Altersgate auf Work/Trade macht Kinder ressourcenlos. Entscheidung: neue Person-only Action `Care`, ADR-14-konform. Begründung: Abschnitt 4. Alternativen: keine Versorgung (verworfen — kein Nutzen); Haushalt-Aggregat (verworfen — Klasse D, Subtask 8 bereits Out-of-Scope). Konsequenzen: neuer Action-Kandidat im Decision-System, ein neuer Config-Wert (`careTransferPerTick`). Betroffene Module: `simulation/decision/actions/`. Persistenzfolgen: keine neuen Felder. Determinismusfolgen: keine (kein RNG). Testfolgen: neue Unit-/Integrationstests analog `Work`/`Trade`.

**ADR-V2-02 — Partnerschaft priorisiert, nicht zwingend**
Status: Accepted (Alternative „zwingend" explizit Rejected). Kontext: Subtask 8 offene Frage. Entscheidung: `Relationships.partnerId?`, additiver Nebeneffekt erfolgreicher Fortpflanzung. Begründung: Abschnitt 5 — Henne-Ei-Blockade-Risiko bei Pflicht-Variante. Alternativen: Pflicht-Partnerschaft (Rejected), eigenständiges `SocialGraph`-Component (Rejected, unbegründete Komplexität). Konsequenzen: `PopulationSystem` erweitert. Betroffene Module: `domain/components/relationships.ts`, `simulation/systems/PopulationSystem.ts`. Persistenzfolgen: ein neues optionales Feld. Determinismusfolgen: keine (kein neuer RNG, ADR-V2-07). Testfolgen: Symmetrie-Invariante (V2-I2) testen.
**Nachtrag Subtask 11/12 (E1)**: Subtask 11 stellte einen reproduzierbaren Verstoß gegen V2-I2 fest — die ursprüngliche Implementierung reservierte eine bestehende Partnerschaft nur, wenn der Partner an diesem Tick zusätzlich lokal eligibel war, wodurch ein lebender, nur ortsabwesender Partner stillschweigend durch einen Dritten ersetzt werden konnte. Subtask 12 hat dies als Implementierungsabweichung von der bereits in Abschnitt 5 vorgesehenen Regel identifiziert (nicht als neue Entscheidung) und `PopulationSystem.buildPairs` entsprechend korrigiert: die Reservierung wirkt jetzt ausschließlich anhand der Lebendigkeit des Partners (`entities.alive`), unabhängig von dessen Ort/Eligibilität an diesem Tick — exakt wie in Abschnitt 5 und V2-I2b wörtlich beschrieben. Kein neuer RNG, keine Änderung der Geburtswahrscheinlichkeit, keine Änderung der Tick-Reihenfolge.

**ADR-V2-03 — Gebäudeverschleiß als eigenständiges `MaintenanceSystem`, self-funded**
Status: Accepted (Alternativen „Erweiterung ProductionSystem" und „Agent-Action Maintain/Repair" Rejected). Kontext: Subtask 8 offene Frage + Wood-Sink-Bedarf. Entscheidung: neues System, automatischer, gebäudeeigener Wood-Verbrauch. Begründung: Abschnitt 6 — Single Responsibility, kein unbegründeter Decision-System-Zuwachs. Konsequenzen: neues Feld `Building.condition?`, neue Tick-Position. Betroffene Module: neues `simulation/systems/MaintenanceSystem.ts`, `domain/environment.ts`, `simulation/systems/ProductionSystem.ts` (liest zusätzlich). Persistenzfolgen: ein neues optionales Feld. Determinismusfolgen: keine (kein RNG). Testfolgen: V2-I4/I5/I6.

**ADR-V2-04 — Rolle als unveränderliches, optionales `Identity`-Feld, kein Rollenwechsel**
Status: Accepted (eigenes mutables `Role`-Component mit Wechsel-Mechanik Rejected). Kontext: Subtask 8 offene Frage. Entscheidung: `Identity.role?`, nur initial zugewiesen. Begründung: Abschnitt 7 — passt zur Unveränderlichkeit von `Identity`; Wechsel-Mechanik unbegründete Komplexität für ein „Should Have". Konsequenzen: `Work`s Zielauswahl-Tie-Break erweitert. Betroffene Module: `domain/components/identity.ts`, `simulation/decision/actions/Work.ts`, `config/schema.ts` (`initialPopulation.roles`). Persistenzfolgen: ein neues optionales Feld. Determinismusfolgen: keine. Testfolgen: Zielauswahl-Präferenz testen.

**ADR-V2-05 — `SupplyDemandMarket` als zweite, zustandslose `Market`-Implementierung; `Market.quote()`-Signatur erweitert**
Status: Accepted (Signatur-Breaking-Change, Verhalten `FixedRatioMarket` unverändert). Kontext: 02 §11 sieht diese Erweiterung bereits vor. Entscheidung: `quote(resource, amount, world)`; Preis rein aus `WorldState`-Beständen abgeleitet, kein eigener Marktzustand. Begründung: Abschnitt 8.4 — vermeidet Persistenzrisiko eines eigenen, nicht in `WorldState` gehaltenen Preisverlaufs. Alternativen: Markt mit eigenem, mutablem Preiszustand außerhalb `WorldState` (Rejected — Determinismus-/Persistenzrisiko nach Save/Load). Konsequenzen: `FixedRatioMarket.quote()` erhält einen ungenutzten dritten Parameter. Betroffene Module: `simulation/economy/`. Persistenzfolgen: keine neuen Felder. Determinismusfolgen: keine (reine Funktion). Testfolgen: V2-I7, Klemmungstests.

**ADR-V2-06 — v2-Weltseeding startet initiale Population als Erwachsene**
Status: Accepted. Kontext: bei der Ausarbeitung neu entdeckt — v1s `createWorld.ts` seedet alle Personen mit `ticksAlive: 0`; kombiniert mit dem Altersgate würde dies zu garantiertem Massensterben ab Tick 0 führen (kein Elternteil für die Startpopulation vorhanden). Entscheidung: v2-Weltseeding setzt `ticksAlive = minAdultAgeTicks` für initiale Personen; Neugeborene bleiben unverändert bei `ticksAlive: 0`. Begründung: Abschnitt 18. Alternativen: Altersgate erst nach `minAdultAgeTicks` Ticks Simulationslaufzeit aktivieren (Rejected — komplexere, zeitabhängige Sonderregel ohne zusätzlichen Nutzen gegenüber der einfacheren Seeding-Anpassung). Konsequenzen: betrifft ausschließlich v2-spezifische Weltseeding-Logik, **nicht** die eingefrorene v1-`createWorld.ts`. Betroffene Module: v2-Äquivalent von `world/createWorld.ts` (Subtask 10). Persistenzfolgen: keine. Determinismusfolgen: keine (weiterhin deterministisch, nur ein anderer Anfangswert). Testfolgen: Regressionstest, dass die Startpopulation nicht sofort verhungert.

**ADR-V2-07 — Kein neuer RNG-Substream für Partnerauswahl**
Status: Accepted. Kontext: Subtask 8 erwog einen `partner-selection`-Substream. Entscheidung: keiner — Partnerschaft ist deterministischer Nebeneffekt der bestehenden `reproduction`-Paarbildung. Begründung: Abschnitt 5/14. Konsequenzen: keine neue RNG-Oberfläche. Betroffene Module: keine (Nicht-Entscheidung). Persistenzfolgen: keine. Determinismusfolgen: keine neue Stream-Isolation nötig. Testfolgen: keine zusätzlichen RNG-Tests nötig.

**ADR-V2-08 — Genau ein neues Event: `BuildingConditionChangedEvent`**
Status: Accepted. Kontext: Observability-Lücke für Gebäudezustand (Abschnitt 17). Entscheidung: ein neues Event, nur bei Bandwechsel. Begründung: analog `WeatherChangedEvent`/`SeasonChangedEvent`; keine weiteren neuen Events (Care/Partnerschaft/Rollen reichen über bestehende Beobachtungsmittel). Konsequenzen: `SimEvent`-Union um einen achten Typ erweitert. Betroffene Module: `domain/events.ts`, `persistence/schema.ts`. Persistenzfolgen: neuer Event-Typ in der Union, Schema erweitert. Determinismusfolgen: keine. Testfolgen: Event-Erzeugung bei Bandwechsel testen.

**ADR-V2-09 — `schemaVersion`-Bump auf 2, ADR-10 unverändert fortgeführt**
Status: Accepted. Kontext: neue persistierte Felder erfordern eine Schema-Änderung. Entscheidung: `CURRENT_SCHEMA_VERSION = 2`, weiterhin kein Migrationspfad. Begründung: Abschnitt 15 — kein konkreter Bedarf für einen Migrationspfad in einem Coursework-PoC. Alternativen: echter Migrationspfad (Rejected, würde ADR-10 aufheben ohne hinreichenden Bedarf). Konsequenzen: v1-Spielstände werden von einer v2-Engine korrekt mit `PersistenceError` abgelehnt. Betroffene Module: `persistence/schema.ts`. Persistenzfolgen: s. o. Determinismusfolgen: keine. Testfolgen: Versionsmismatch-Test (bereits als Muster in v1 vorhanden) auf `2` aktualisiert.

---

## 23. Implementierungsreihenfolge (für Subtask 10)

1. **Baseline-Regressionstests**: bestehende 70 v1-Tests laufen lassen, Ausgangszustand bestätigen.
2. **Fehlende v1-Integrationstests nachziehen** (technische Schuld #1) — vor jeder neuen v2-Logik.
3. **Domain-Erweiterungen**: `Relationships.partnerId?`, `Identity.role?`, `Building.condition?`, `SimEvent`-Erweiterung um `BuildingConditionChangedEvent`.
4. **Config**: neue Blöcke/Felder aus Abschnitt 16, inkl. Validierung.
5. **v2-Weltseeding**: initiale Population startet als Erwachsene (ADR-V2-06) — **vor** dem Altersgate implementieren, sonst sofortiger Testkollaps.
6. **`MaintenanceSystem`** (neu) + `ProductionSystem`-Erweiterung (Verschleiß-Multiplikator).
7. **Altersgate** in `Work`/`Trade` (V2-I3) — **nach** Schritt 5, sonst der in Abschnitt 18 beschriebene Kollaps.
8. **`Care`-Action** — direkt im Anschluss an Schritt 7, da beide voneinander abhängen (Reihenfolge nicht vertauschbar).
9. **Partnerschafts-Nebeneffekt** in `PopulationSystem`.
10. **Rollen** (`Identity.role`, `Work`-Zielauswahl-Erweiterung, `initialPopulation.roles`-Config).
11. **`SupplyDemandMarket`** + `Market.quote()`-Signaturerweiterung.
12. **Persistenz**: `schemaVersion`-Bump, Schema-Erweiterung, Referenzintegritätsprüfungen (V2-I1, V2-I5, V2-I9).
13. **Neue Unit-/Integrationstests** für alle v2-Regeln (Abschnitt 19).
14. **Empirische Langzeitvalidierung** (v2-Analog zu Subtask 5) — insbesondere die in Abschnitt 18 benannten Risiken.

Begründung der Reihenfolge: Schritte 5→7→8 sind **zwingend** in dieser Abhängigkeitsreihenfolge (Weltseeding vor Altersgate vor Care), da jede andere Reihenfolge einen zwischenzeitlich funktionsunfähigen oder garantiert kollabierenden Zwischenstand erzeugen würde.

---

## 24. Abnahmekriterien für Subtask 10

- `npm run typecheck` erfolgreich.
- Alle bestehenden v1-Tests weiterhin erfolgreich (0 Regressionen).
- Alle drei in Abschnitt 19 genannten, bislang fehlenden v1-Integrationstests sind vorhanden und bestehen.
- Jede neue v2-Regel (Abschnitte 4–8) besitzt mindestens einen Unit-Test; `Care`, Altersgate und `MaintenanceSystem` besitzen zusätzlich einen Integrationstest über die echte Tick-Schleife.
- Determinismus bleibt erhalten: die drei bestehenden Determinismus-Tests bestehen weiterhin, ergänzt um mindestens einen Lauf mit aktivierten v2-Optionen.
- Save/Load bleibt vollständig: ein Save/Load-Rundreisetest mit gesetzten `partnerId`/`role`/`condition`-Feldern besteht.
- Keine Architekturzyklen (derselbe Dependency-Check wie in Subtask 4.1/6 wird erneut durchgeführt und ist unauffällig).
- Keine unkontrollierten RNG-Quellen (Grep-Check auf `Math.random()`/`Date.now()`/`new Date()` bleibt auf die bekannte, sanktionierte Stelle beschränkt).
- Observability erhalten: `BuildingConditionChangedEvent` wird bei Bandwechsel korrekt erzeugt und ist über `events` abrufbar.
- Keine der in Abschnitt 10 gelisteten Invarianten (V2-I1–V2-I9) wird verletzt (durch Tests nachgewiesen).
- Empirisch plausibles Langzeitverhalten: kein garantierter Kollaps der Startpopulation (ADR-V2-06 wirksam), keine dauerhafte Fortpflanzungsblockade, `condition` fällt nie dauerhaft auf einen Totalausfall.

---

## 25. Explizit Out of Scope (v2)

Partnerschaft als Fortpflanzungs-Pflicht; Partnertrennung/Scheidung; Rollenwechsel zur Laufzeit; Haushalte als eigenständiges Aggregat; Prädator/Beute; Krankheitssystem; Dashboard/UI-Visualisierung; Coverage-Tooling; größerer/dynamischer Weltgraph; echter Mehrfach-Versions-Migrationspfad; Dependency-Graph-basierte Systemplanung (ADR-11); Event-Reaktionsketten/Pub-Sub (ADR-06); jede Erweiterung aus dem 01-§3.3-Katalog (Echtzeit-/physikbasierte Bewegung, Mehrspieler, Politik/Krieg, NLP, Grafik-Engine, ML-Verhalten, verteilte Großskalierung).

---

## 26. Schlussfolgerung

Alle vier von Subtask 8 offen gelassenen Entscheidungen wurden verbindlich getroffen, formal als ADRs festgehalten und gegen die tatsächliche v1-Implementierung geprüft. Eine bei dieser Prüfung neu entdeckte, kritische Wechselwirkung (garantiertes Massensterben der Startpopulation) wurde identifiziert, nicht verschwiegen, und durch eine explizite, begründete v2-Entscheidung (ADR-V2-06) aufgelöst. Der resultierende Scope ist minimal-invasiv (kein neuer Port, kein neuer RNG-Substream, genau ein neues Event), vollständig v1-verträglich klassifiziert (überwiegend Klasse A/B, die einzige Klasse-C-Option — Partnerschaftspflicht — wurde explizit verworfen), und liefert eine für Subtask 10 direkt umsetzbare, abhängigkeitsklare Implementierungsreihenfolge.
