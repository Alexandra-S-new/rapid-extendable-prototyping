# Subtask 8 — v2 Recherche & Konzeption

> **V1 BASELINE FROZEN** — dieses Dokument beschreibt ausschließlich die geplante v2-Entwicklung. Es verändert, korrigiert oder relativiert keine Aussage der eingefrorenen v1-Baseline (`01-recherche-konzeption.md`, `02-architektur.md`, `03-domaenenmodell.md`, `03.5-konsistenzpruefung.md`, `src/`, `tests/`). Wo eine v2-Option eine bestehende v1-Regel ändern würde, ist dies explizit als Breaking/Behavior Change gekennzeichnet — nichts davon ist bereits entschieden oder umgesetzt.

Legende: **Erkenntnis** (externe Recherche) · **v1-Befund** (aus Implementierung/Tests/Subtask 5/6) · **Option** (mögliche v2-Lösung) · **Bewertung** (Analyse einer Option) · **Entscheidung** (verbindliche v2-Festlegung) · **Annahme** (noch nicht validiert) · **Offene Frage** (bewusst vertagt).

---

## Phase A — v1-Bestandsaufnahme

### Was v1 tatsächlich kann

Deterministische Tick-Simulation (Perception→Decision→Action→Resolution→Cleanup) mit Person/Animal-Entities, Utility-AI-Entscheidung über fünf Actions (Eat/Sleep/Socialize/Work/Trade), Barter-Wirtschaft (Food/Wood, `FixedRatioMarket`), Alterung/Fortpflanzung (nur Person)/Sterblichkeit (`starvation`/`old_age`, generisch), statischer Weltgraph mit vorab berechneten Pfaden, additive Event-History, vollständige JSON-Persistenz mit RNG-Zustand, CLI (`run`/`inspect`/`stats`/`events`). Empirisch bestätigt (Subtask 5): Population zeigt selbstregulierende Boom-Bust-Dynamik um eine ressourcengetriebene Kapazitätsgrenze, Determinismus hält auch über Save/Load und lange Läufe (5000+ Ticks, ~0,1 ms/Tick).

### Was bewusst nicht Bestandteil von v1 ist

**v1-Befund** (aus 01 §3.2/§3.3, weiterhin gültig, siehe Freeze-Hinweis in 02): explizit als *später sinnvoll, aber zurückgestellt* deklariert — Sozialgraph über Eltern-Kind hinaus, Job-/Arbeitsmarkt-Matching, Krankheitssystem, mehrere Ressourcen mit Preisschwankung, mehrere Tierarten inkl. Prädator/Beute, GOAP-artige Planung, Dashboard/UI-Visualisierung. Explizit *dauerhaft ausgeschlossen* (01 §3.3) — Echtzeit-/physikbasierte Bewegung, Mehrspieler/Netzwerk, Politik/Kriminalität/Krieg, NLP-Dialoge, Grafik-Engine-Integration, ML-gesteuertes Verhalten, verteilte/parallele Großskalierung (>1000 Agenten).

**Wichtiger Befund:** Ein Punkt aus der 01-§3.2-Liste ist in v1 bereits umgesetzt und damit **kein** offener v2-Kandidat mehr: „Wettereffekte auf Ernte/Gebäude" — `ProductionSystem` skaliert Food/Wood-Produktion bereits mit Season- und Weather-Multiplikatoren (`src/simulation/systems/ProductionSystem.ts`).

### Bereits extensible Systeme (v1-Befund)

- **Actions**: neue Handlung = neue Datei in `simulation/decision/actions/`, ohne `DecisionSystem`/`ActionExecutionSystem` zu ändern (Open/Closed, empirisch genutzt: Work/Trade folgen demselben Muster).
- **Market**: `Market`-Interface ist bereits für eine zweite Implementierung vorgesehen — 02 §11 nennt `SupplyDemandMarket` ausdrücklich als „konkrete, in 01 §6 geforderte Nachweis-Erweiterung".
- **Events**: `SimEvent`-Union ist additiv erweiterbar, ohne bestehende Verarbeitung zu ändern (ADR-06: reine Queue→History, kein Pub-Sub).
- **Components**: neue optionale Felder auf bestehenden Components oder neue Components sind strukturell vorgesehen (ECS-lite: neue Fachlichkeit = neue Component + neues/erweitertes System, 01 §7 Punkt 1).

### Grenzen des aktuellen Modells (v1-Befund)

- `deriveLifeStage()` (`domain/components/age.ts`) existiert, wird aber **von keinem System gelesen** — Kinder verhalten sich abgesehen von der Fortpflanzungs-Alters-Schwelle identisch zu Erwachsenen (können ab Geburt `Work`/`Trade` ausführen). Dies ist eine reale, bisher nie genutzte Modellierungslücke.
- `Relationships` kennt ausschließlich `parentIds`/`childIds` — keine Partnerschaften, Freundschaften oder Gruppen.
- Fortpflanzungs-Pairing ist rein ortsbasiert-sequenziell nach `EntityId` (03 §12) — unabhängig von Beziehungshistorie.
- Wood hat keinen Verbrauchs-Sink außer `Trade` (Subtask 5, Szenario I: Wood akkumulierte auf 76.603 bei Tick 5000, während Food unter Bevölkerungsdruck auf 251 fiel).
- `PathTable` (Floyd-Warshall, `world/PathTable.ts`) ist bei der dokumentierten Weltgraphgröße (~10–30 Orte) trivial, skaliert aber kubisch mit der Ortsanzahl.
- Animal-Populationen sind bewusst homogen (eine `species`-Unterscheidung existiert auf `Identity`, wird aber nicht ausgewertet); keine Interaktion zwischen Tierarten.
- Alle in Subtask 6 identifizierten technischen Schulden bestehen unverändert fort (s. Abschnitt „Technische Schulden" unten).

---

## Phase C — Externe Recherche

**Erkenntnis (Utility-AI in Life-Simulationsspielen):** *Die Sims* nutzt Utility-AI, bei der jedes Bedürfnis („Commodity", inspiriert von Maslows Bedürfnishierarchie) in einen Nutzenwert je Handlung übersetzt wird; die Distanz zum Handlungsort fließt als multiplikativer Faktor in den Score ein. [Enhancing Game AI with Utility AI](https://www.toolify.ai/ai-news/enhancing-game-ai-with-utility-ai-2770077), [Design Patterns for the Configuration of Utility-Based AI](https://course.ccs.neu.edu/cs5150f13/readings/dill_designpatterns.pdf) — bestätigt die in v1 gewählte Grundarchitektur (Utility-AI + FSM-Ausführung) auch für eine vertiefte v2-Bedürfniswelt als tragfähig, ohne dass ein Wechsel auf GOAP/BDI nötig würde.

**Erkenntnis (Emergenz in Multi-Agenten-Systemen):** Emergenz entsteht durch mehrfache positive **und** negative Rückkopplungsschleifen; kohärente globale Strukturen entstehen aus lokaler Interaktion, wobei Top-Down-Feedback von der Gruppe die lokalen Interaktionen wiederum einschränkt. [Fundamentals of Agent-Based Modeling](https://www.researchgate.net/publication/383411092_Fundamentals_of_Agent-Based_Modeling_Emergence_and_complex_adaptive_systems) — Konsequenz für v2: jede neue lokale Regel (z. B. Partnerschafts-Pairing, Wood-Verschleiß) muss explizit auf **beide** Rückkopplungsrichtungen geprüft werden (Abschnitt „Emergenzrisiken").

**Erkenntnis (Haushalts-/Familienmodellierung in der Sozialsimulation):** Agentenbasierte Demografie fokussiert v. a. auf Partnerschafts-/Familienbildung, mit Erweiterungen zu Migration und Haushaltsdynamik; präferierte Familiengröße kann sogar vom sozialen Netzwerk umliegender Agenten abhängen. [When Demography Met Social Simulation](https://jasss.soc.surrey.ac.uk/16/4/9.html), [Synthetic Population Dynamics](https://www.researchgate.net/publication/287577946_Synthetic_Population_Dynamics_A_Model_of_Household_Demography) — bestätigt, dass ein Sozialgraph jenseits von Eltern-Kind ein etablierter, nicht-trivialer Erweiterungsschritt ist (kein Nischenthema).

**Erkenntnis (Ressourcen-Sinks in Simulationsspielen):** Ressourcen-„Sinks" (z. B. Saatgut-Rückkauf, Ausrüstungsverschleiß, Zutaten-Nachschub) sind notwendige Abflüsse, ohne die eine Wirtschaft zu unkontrollierter Akkumulation/Inflation tendiert. [Economy Design in Simulation Games](https://altheragames.com/en/blog/simulation-game-economy-design) — direkte Bestätigung der aus Subtask 5 empirisch beobachteten Wood-Akkumulation als **erklärbare, aber durch einen gezielten Sink adressierbare** Eigenschaft, nicht als Bug.

**Erkenntnis (ECS-Skalierung):** ECS skaliert grundsätzlich gut mit der Entity-Zahl (Lokalität, keine Vererbungstiefe), die reale Schwierigkeit liegt in der **Granularität** von Components/Systemen — zu kleine Components verteilen zusammenhängenden Zustand, zu große erschweren Wartung; „ein System pro Component-Typ" funktioniert nur für einfache Szenarien. [The Entity-Component-System Design Pattern](https://www.umlboard.com/design-patterns/entity-component-system.html) — Konsequenz für v2: neue Components (z. B. `Role`, erweiterte `Relationships`) sollten so geschnitten werden, dass kein System mehrere fachlich unabhängige Components „mitlesen" muss, nur um eine einzelne neue Regel umzusetzen.

**Erkenntnis (Save-Versionierung):** Etablierte Praxis ist ein `schemaVersion`-Feld an der Wurzel, pro-Version-DTOs und **reine, deterministische** Migrationsfunktionen, die stufenweise (nicht direkt v1→vN) angewendet und auch als Stapel getestet werden. [Versioned Indie Save System](https://arcadeonstudios.co.uk/blog/a-practical-save-system-for-indie-games-versioned-portable-testable) — relevant für die Bewertung, ob v2 einen Migrationspfad braucht (Abschnitt „Persistenzfolgen").

**Erkenntnis (Event-getriebene Architekturen):** Reaktionsketten (Choreographie über mehrere Event-Handler) sind schwerer nachvollziehbar als eine feste Aufrufreihenfolge; nicht-idempotente Konsumenten unter „at-least-once"-Zustellung sind eine häufige Fehlerquelle. [How I Used Event-Driven Architecture in the Wrong Way](https://medium.com/@shiiyan/how-i-failed-in-event-driven-architecture-86eb493082fa) — bestätigt die in v1 (ADR-06) bewusst getroffene Entscheidung gegen Pub-Sub/Reaktionsketten auch für v2 als weiterhin richtig, sofern die Simulation überschaubar bleiben soll.

**Getrennt von diesen Erkenntnissen**: keine der Rechercheergebnisse begründet für sich allein eine v2-Anforderung — sie fließen nur dort ein, wo Abschnitt „v2-Anforderungen" sie explizit aufgreift.

---

## v1-Verträglichkeits-Klassifikation

**A** = additive Erweiterung · **B** = Erweiterung mit begrenzten Anpassungen · **C** = Änderung bestehender v1-Regeln · **D** = grundlegender Architektur-/Domänenumbau.

| Bereich | Option | Klasse | Begründung |
|---|---|---|---|
| Wirtschaft | Wood-Sink über Gebäude-Instandhaltung | A | neue Verbrauchsregel, kein bestehendes Feld/Interface geändert |
| Wirtschaft | `SupplyDemandMarket` (zweite `Market`-Implementierung) | A | von 02 §11 bereits als Erweiterungspunkt vorgesehen |
| Wirtschaft | Jobs/Rollen-Spezialisierung | B | neues Feld auf `Identity`/neues Component; `Work`-Scoring muss es lesen |
| Population | Altersabhängiges Verhalten (Kinder ≠ Erwachsene bei Work/Trade) | B | `canExecute()` bestehender Actions wird verschärft — **Behavior Change ggü. v1** (v1 erlaubt dies aktuell uneingeschränkt) |
| Population | Erweiterter Sozialgraph (Partnerschaften/Freundschaften) | A | neues Feld auf `Relationships`, kein bestehendes entfernt |
| Population | Partnerschaft als **Voraussetzung** für Fortpflanzung | C | ändert die in 03 §12 fixierte „jedes eligible Paar gleich wahrscheinlich"-Regel |
| Population | Haushalte als eigenständiges Aggregat mit eigener Pairing-Logik | D | neue Beziehung Person↔Location/Building, würde Fortpflanzungsregel grundlegend umbauen |
| Animals | Weitere `species`-Werte ohne Verhaltensunterschied | A | nutzt bereits vorhandenes, ungenutztes Feld |
| Animals | Prädator/Beute-Dynamik | B | neue Action (additiv), aber neue Interaktionsregel zwischen zwei Animals |
| Movement | Moderat größerer, weiterhin statischer Weltgraph | A | `PathTable`-Strategie bleibt gültig |
| Movement | Dynamischer/stark vergrößerter Weltgraph, andere Pathfinding-Strategie | C | ändert die „einmalige, statische Vorberechnung"-Regel (02 §10) |
| Events | Neue Event-Typen (z. B. `WorkEvent`) | A | erweitert nur die `SimEvent`-Union |
| Persistenz | `schemaVersion`-Bump ohne Migration | A | exakt das in ADR-10 bereits vorgesehene Verhalten bei Strukturänderung |
| Persistenz | Echter v1→v2-Migrationspfad | C | hebt ADR-10 („kein Migrationspfad") explizit auf |

---

## v2-Anforderungen

### Funktionale Anforderungen
Die Simulation soll zusätzlich: Partnerschaften/erweiterte Sozialbeziehungen abbilden, altersabhängiges Agentenverhalten unterscheiden, mindestens einen zusätzlichen Ressourcen-Sink besitzen, optional Rollen-/Spezialisierungslogik für Work unterstützen.

### Verhaltensanforderungen
Neue emergente Muster, die v1 strukturell nicht abbilden kann: Wood-Zirkulation statt reiner Akkumulation; sichtbar unterschiedliche Lebensphasen (Kinder als Abhängige, nicht als vollwertige Wirtschaftsteilnehmer); ggf. sozial geprägte Paarbildung statt rein positionsbasierter Zufallspaarung.

### Systemische Anforderungen
Erweiterung von `ProductionSystem` **oder** ein neues, klar abgegrenztes System für Gebäude-Verschleiß; Erweiterung von `PopulationSystem` für alters-/beziehungsabhängige Regeln; ggf. neues `simulation/economy/SupplyDemandMarket.ts`.

### Architektur-Anforderungen
Die bestehende Schichtung (`domain ← world ← simulation ← application ← presentation`) muss neue Components/Systeme aufnehmen können, ohne dass `simulation/` neue Abhängigkeiten auf `observability/`/`persistence/`/`config/`/`random/` braucht (Fortführung des bestehenden DI-Musters). Neue Ports sind nach aktuellem Stand **nicht** absehbar nötig (alle betrachteten v2-Optionen sind reine Domänen-/Simulationslogik).

### Persistenz-Anforderungen
Neue Zustände (Rollen, Partnerschaften, Gebäude-Verschleißzustand) müssen Teil von `SaveFile` werden; neue Referenzen (`partnerIds`) brauchen dieselbe Referenzintegritätsbehandlung wie bestehende `parentIds`/`childIds` (Plausibilität statt Lebendigkeits-Zwang, 03 §15).

### Determinismus-Anforderungen
Jedes neue System, das Zufall benötigt (z. B. eine RNG-gestützte Partnerwahl unter mehreren gleich geeigneten Kandidaten), bekommt einen **neuen, eindeutig benannten Substream** (02 §8 Regel 3) — keine Wiederverwendung von `reproduction`/`agent-decision`/etc.

### Observability-Anforderungen
Jede neue fachliche Wirkung (Partnerbindung, Rollenwechsel, Gebäudeverschleiß, Prädation) sollte — analog zu `BirthEvent`/`TradeEvent` — über einen neuen `SimEvent`-Typ nachvollziehbar sein, sofern sie ein diskretes, beobachtungswürdiges Ereignis ist (nicht jede kontinuierliche Zustandsänderung braucht ein Event, analog zu `Needs`-Zerfall, der ebenfalls kein Event erzeugt).

### Performance-Anforderungen
**Annahme** (nicht abschließend validiert): v2 zielt weiterhin auf die in 01 §8 genannte Größenordnung (100–300 Personen, 50–150 Tiere) — keine begründete Notwendigkeit für eine andere Größenordnung wurde in dieser Recherche identifiziert. Sollte ein v2-Feature (z. B. deutlich größerer Weltgraph) diese Annahme berühren, ist das in Subtask 9 gesondert zu bewerten.

---

## Bewertungsmatrix (Kernoptionen)

| Option | Plausibilität | Emergenzpotenzial | Komplexität | Aufwand | Architekturverträglichkeit | Determinismus | Persistenzaufwand | Testbarkeit | Performance | Erweiterbarkeit | Auswirkung auf v1-Regeln | Risiko unerwünschter Emergenz |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Wood-Sink (Gebäudeverschleiß) | hoch | mittel | niedrig | niedrig | A | unverändert (kein neuer RNG-Bedarf zwingend) | gering | hoch | vernachlässigbar | hoch | keine | mittel (Doppel-Knappheit möglich, s. u.) |
| `SupplyDemandMarket` | hoch | mittel | mittel | mittel | A | unverändert | gering | hoch | vernachlässigbar | hoch | keine | niedrig |
| Jobs/Rollen | mittel | mittel | mittel | mittel | B | unverändert | gering | mittel | vernachlässigbar | mittel | keine (additiv) | niedrig |
| Altersabhängiges Verhalten | hoch | hoch | niedrig | niedrig | B | unverändert | gering | hoch | vernachlässigbar | mittel | **ja** (Behavior Change) | **hoch** (Versorgungsfrage offen, s. Emergenzrisiken) |
| Erweiterter Sozialgraph | hoch | hoch | mittel | mittel | A | unverändert | gering | mittel | vernachlässigbar | hoch | keine | mittel |
| Partnerschaft als Fortpflanzungs-Pflicht | mittel | hoch | mittel | mittel | C | unverändert | gering | mittel | vernachlässigbar | mittel | **ja** (03 §12) | mittel (Geburtenrate könnte stark sinken) |
| Prädator/Beute | mittel | hoch | hoch | hoch | B | neuer Substream nötig | gering | mittel | vernachlässigbar | mittel | keine (additiv) | **hoch** (Aussterberisiko einer Art) |
| Haushalte (eigenständiges Aggregat) | niedrig–mittel | mittel | hoch | hoch | D | unverändert | hoch | niedrig (neu) | vernachlässigbar | niedrig (für v2) | **ja**, potenziell tiefgreifend | mittel |

---

## Emergenzrisiken (Detailanalyse Must-Have-Kandidaten)

### Wood-Sink über Gebäude-Instandhaltung
- **Lokale Regel**: jedes Gebäude verbraucht periodisch Wood aus einem Bestand; unzureichende Deckung senkt (z. B.) dessen Produktionsrate.
- **Globaler Effekt**: Wood zirkuliert zwischen Produktion (Workplace) und Verbrauch (alle Gebäude) statt sich unbegrenzt anzusammeln.
- **Positive Rückkopplung**: mehr Population → mehr `Work` am Workplace → mehr Wood-Produktion — durch die endliche, statische Gebäudezahl in v1/v2 (kein dynamischer Gebäudebau) von selbst begrenzt.
- **Negative Rückkopplung**: sinkender Wood-Bestand → sinkende Produktionsrate der betroffenen Gebäude → dämpft weiteres Wachstum (stabilisierend, erwünscht).
- **Kollaps-Risiko**: bei zu aggressiver Verschleißrate könnten Food- **und** Wood-Produktion gleichzeitig einbrechen und den bereits in Subtask 5 beobachteten Starvation-Cluster-Effekt (B2-Szenario) verschärfen. **Annahme, nicht validiert** — muss in Subtask 9/10 durch konservative Default-Werte und ggf. eine empirische Nachprüfung (analog Subtask 5) abgesichert werden.

### Altersabhängiges Verhalten
- **Lokale Regel**: `Work`/`Trade`.`canExecute()` liefert für `LifeStage === 'child'` `false`.
- **Offene Frage (nicht in diesem Subtask entschieden):** v1 besitzt **keinen** Mechanismus, der Kinder mit Ressourcen versorgt (kein „Eltern teilen Food mit Kindern"). Ohne eine solche Regel würden Kinder, die nicht selbst `Work`/`Trade` ausführen dürfen, aber auch von niemandem versorgt werden, systematisch verhungern — ein durch diese einzelne Änderung neu entstehendes, nicht triviales Kollaps-Risiko. Diese Frage muss vor einer Umsetzung explizit fachlich entschieden werden (Kandidat für Subtask 9/10, nicht hier vorentschieden).

### Erweiterter Sozialgraph / Partnerschaft
- **Lokale Regel**: `partnerIds` auf `Relationships`; Fortpflanzungs-Pairing bevorzugt bestehende Partnerschaften.
- **Globaler Effekt**: je nachdem, ob Partnerschaft nur **priorisiert** (additiv, Klasse A) oder **verpflichtend** (Klasse C, ändert 03 §12) gemacht wird, könnte die Geburtenrate spürbar sinken (weniger „verfügbare" Paare) oder unverändert bleiben.
- **Offene Frage**: welche der beiden Varianten für v2 gewählt wird, ist hier bewusst nicht entschieden — beide sind fachlich plausibel, mit unterschiedlichem Eingriffstiefe in die eingefrorene v1-Fortpflanzungsregel.

### Prädator/Beute
- **Lokale Regel**: eine neue `Hunt`-Action lässt einen Prädator-Animal ein Beute-Animal am selben Ort in Nahrung umwandeln.
- **Risiko**: ohne sorgfältige Ratenbegrenzung ein klassisches Lotka-Volterra-artiges Aussterberisiko einer Art (Beute überjagt → Prädatoren verhungern anschließend selbst) — bekanntes Muster in Populationsdynamik-Modellen, hohe Sorgfalt bei Parametrisierung nötig, falls umgesetzt.

---

## Population und Lebenszyklus — vertiefte Betrachtung

Für jede Erweiterung wird das dadurch neu ermöglichte emergente Verhalten benannt (Vorgabe Abschnitt 10 der Aufgabenstellung):

- **Lebensphasen (Kinder ≠ Erwachsene)**: ermöglicht sichtbare Generationenstruktur (Familien mit abhängigen Kindern statt gleichwertigen Wirtschaftsteilnehmern) — v1 kann dies mangels Nutzung von `deriveLifeStage()` aktuell nicht darstellen.
- **Partnerschaften**: ermöglichen wiederkehrende Paarbeziehungen über mehrere Geburten hinweg statt rein zufälliger Neu-Paarung pro Fortpflanzungsversuch — v1 „vergisst" nach jedem Fortpflanzungsversuch faktisch, wer mit wem bereits Kinder hatte (außer über `Relationships.parentIds`, das nicht für die Auswahl selbst genutzt wird).
- **Haushalte, soziale Rollen, Migration**: in dieser Recherche als **nicht** ausreichend durch einen konkreten, v1-Mangel motiviert eingestuft (kein empirischer v1-Befund oder Subtask-5-Beobachtung, der dies unmittelbar nahelegt) — bleiben Could-Have/Out-of-Scope-Kandidaten, nicht Must-Have.

---

## Animals — Entscheidungsgrundlage

Ausdrücklich berücksichtigt: die Einfachheit der Animals ist eine **bewusste v1-Baseline-Eigenschaft**, kein automatisch zu beseitigender Mangel (Subtask 3.6b, empirisch in Subtask 5 als konsistent funktionierend bestätigt). Diese Recherche identifiziert **keinen** empirischen v1-Befund, der individuelles Animal-Verhalten, eigene komplexere Bedürfnisse oder Animal-Fortpflanzung fachlich zwingend macht. Prädator/Beute (01 §3.2, seit Subtask 1 als „sinnvolle Erweiterung" vorgesehen) bleibt ein plausibler, aber **nicht** must-have-relevanter Kandidat (Could-Have) — hohes Emergenzpotenzial, aber auch das in dieser Recherche höchste Kollaps-Risiko unter den betrachteten Optionen.

---

## Wirtschaft und Ressourcen — vertiefte Betrachtung

**Leitfrage** (Vorgabe Abschnitt 12): *Welche minimale zusätzliche Modellierung erzeugt den größten Zugewinn an glaubwürdigem emergentem Verhalten?* Antwort dieser Recherche: der **Wood-Sink** — eine einzelne neue Verbrauchsregel behebt direkt die in Subtask 5 empirisch dokumentierte, unbegrenzte Wood-Akkumulation und erzeugt echte wirtschaftliche Zirkulation, ohne neue Entities, Components oder Ports. `SupplyDemandMarket` ist der zweitgrößte Zugewinn (dynamische statt fixer Preise), ebenfalls minimal-invasiv, da 02 §11 die Erweiterungsstelle bereits vorsieht. Jobs/Rollen erzeugen zusätzliche Glaubwürdigkeit, aber geringeres zusätzliches Emergenzpotenzial gegenüber dem Aufwand (mittlere statt hohe Priorität).

---

## Decision-System — vertiefte Betrachtung

ADR-14 (Anwesenheit ist Ausführungs-, nicht Auswahlvoraussetzung für ortsgebundene Actions) wird für **alle** in diesem Dokument betrachteten neuen Actions (`Hunt`, ggf. rollenspezifische Work-Varianten) unverändert vorausgesetzt — keine der hier bewerteten Optionen erfordert eine Änderung dieser Regel. Zusätzliche Bedürfnisse (z. B. „purpose"/„safety") wurden erwogen, aber **nicht** in den Scope aufgenommen: es fehlt ein konkreter, aus v1-Befunden oder Subtask-5-Beobachtungen abgeleiteter Bedarf (Annahme, in dieser Recherche keine hinreichende Begründung gefunden) — bleibt Could-Have/Out-of-Scope.

---

## Movement und Welt — vertiefte Betrachtung

Die bestehende `PathTable`-Strategie (einmalige Floyd-Warshall-Vorberechnung) bleibt für einen moderat wachsenden, weiterhin statischen Weltgraphen (bis grob geschätzt ~50 Orte) unverändert tragfähig — kubisches Wachstum ist bei dieser Größenordnung unproblematisch. Ein deutlich größerer oder dynamischer Weltgraph (Migration, Regionen, prozedural erzeugte Infrastruktur) würde diese Strategie an ihre Grenzen bringen und zusätzlich die in 02 §10 fixierte „kein dynamischer Gebäudebau/Weltgraph in v1"-Grenze berühren — als Kategorie-C/D-Thema explizit auf **Could-Have/Out-of-Scope** eingestuft, nicht Bestandteil eines minimalen v2.

---

## Events und Observability — vertiefte Betrachtung

Unterscheidung (Vorgabe Abschnitt 15): eine **tatsächliche Zustandsänderung** (Partnerbindung, Gebäudeverschleiß-Schwelle unterschritten, Prädation) ist ein Event-Kandidat; eine **Entscheidung** (DecisionSystem wählt eine Action) ist es nicht (wie schon in v1 — Actions selbst lösen keine Events aus, nur ihre fachlichen Wirkungen); **Ursache/Folge** bleiben wie in v1 durch Tick-Nähe und `sequence`-Reihenfolge rekonstruierbar, nicht durch explizite Verkettung (ADR-06 bleibt); **abgeleitete Statistik** gehört weiterhin in `observability/`, nicht in die Event-History. Die bestehende `RingBuffer`-Strategie skaliert für die erwogenen v2-Ergänzungen unverändert (Kapazität bleibt konfigurierbar, kein struktureller Änderungsbedarf identifiziert).

---

## Persistenzfolgen

Jede neue persistente Struktur (Rollen, Partnerschaften, Gebäude-Verschleißzustand) erweitert `SaveFile` und erfordert einen `schemaVersion`-Bump. **v1 besitzt bewusst keinen Migrationspfad (ADR-10).** Bewertung der drei Optionen aus Abschnitt 16 der Aufgabenstellung:

- **Weiterhin strikt ohne Migration** — konsistent mit ADR-10, keine neue Entscheidung nötig, alte (v1-)Spielstände werden beim v2-Schema-Wechsel korrekt und erwartungsgemäß abgelehnt (exakt das dokumentierte Verhalten, kein Bruch).
- **v2-Schema-Version ohne Migration, aber mit versioniertem Envelope** (Erkenntnis: pro-Version-DTOs, s. Recherche) — bereits durch das bestehende `schemaVersion`-Feld abgedeckt, keine neue Architektur nötig.
- **Echtes Migrationskonzept** — würde ADR-10 explizit aufheben (Kategorie C); der recherchierte Nutzen (reine, testbare Migrationsfunktionen) ist real, aber für ein Coursework-PoC ohne im Feld befindliche Nutzer-Spielstände nicht durch einen konkreten Bedarf begründet.

**Bewertung**: Für v2 wird empfohlen (nicht hier final entschieden, da Subtask 9/10 Domänenentscheidungen treffen), ADR-10 unverändert fortzuführen — reiner `schemaVersion`-Bump bei v2-Release, weiterhin keine Migration.

---

## Determinismus — Anforderungen an neue Systeme

Für jede in diesem Dokument als Must/Should eingestufte Option: keine der Optionen benötigt eine neue externe Zeitquelle oder Umgebungsabhängigkeit. RNG-Bedarf entsteht potenziell bei: Partnerwahl unter mehreren gleich geeigneten Kandidaten (neuer Substream, z. B. `partner-selection`), Prädation-Erfolgswahrscheinlichkeit (neuer Substream, z. B. `predation`). Beide würden — wie alle bestehenden Substreams — lazy erzeugt und über `RngOrchestrator` persistiert; keine Wiederverwendung bestehender Substreams (02 §8 Regel 3).

---

## Technische Schulden — Behandlung für v2

| # | Schuld | Entscheidung |
|---|---|---|
| 1 | Fehlende Integrationstests (02 §19: Agentenlebenszyklus, Wirtschaftskreislauf, Population inkl. Cleanup) | **v2 verpflichtend beheben** — vor neuen v2-Systemen nachziehen, damit die Testbasis nicht mit wachsender v2-Komplexität weiter zurückfällt (s. Roadmap) |
| 2 | Fehlende Unit-Tests für 8 Systeme | **v2 optional beheben** — jedes neu erweiterte System (z. B. `PopulationSystem` bei Altersregel) bekommt ohnehin neue Tests; die verbleibenden unveränderten Systeme nachzuziehen ist wünschenswert, aber kein Muss vor v2-Start |
| 3 | CLI-Validierungslücke (`--ticks` nicht-numerisch) | **weiterhin bewusst verschieben** — reine CLI-Robustheit, kein Bezug zu v2-Fachlogik |
| 4 | Dev-Dependency-Schwachstellen (esbuild/vite via vitest 2.x) | **weiterhin bewusst verschieben** — eigenständiges Tooling-Vorhaben (vitest-4-Upgrade), unabhängig von v2-Fachlogik |
| 5 | Fehlende Coverage-Infrastruktur | **v2 optional beheben** — günstiger Zeitpunkt parallel zu neuen Tests, aber kein Muss |

Keine der fünf Schulden wird durch die hier skizzierte v2-Architektur automatisch erledigt.

---

## v2-Scope

### Must Have
1. Nachziehen der drei in 02 §19 geforderten Integrationstests (technische Schuld #1) — **vor** neuer Implementierung.
2. Mindestens ein zusätzlicher Ressourcen-Sink (Wood-Verschleiß) — behebt die in Subtask 5 empirisch belegte unbegrenzte Wood-Akkumulation.
3. Erweiterter Sozialgraph (mindestens Partnerschafts-Feld, additiv/Klasse A) — grundlegende, seit 01 §3.2 vorgesehene Erweiterung, Voraussetzung für glaubwürdigere Population-Dynamik.
4. Klärung der offenen Versorgungsfrage, **bevor** altersabhängiges Verhalten umgesetzt wird (Reihenfolge-Anforderung, kein Feature für sich).

### Should Have
1. Altersabhängiges Verhalten (Kinder ≠ Erwachsene bei Work/Trade) — **nur nach** Klärung der Versorgungsfrage.
2. `SupplyDemandMarket` als zweite `Market`-Implementierung.
3. Jobs-/Rollen-Spezialisierung (einfache Rollen, keine volle Marktdynamik).
4. Neue Events für die neuen Systeme (Partnerbindung, Gebäudeverschleiß, Rollenwechsel).
5. Unit-Tests für die 8 bisher ungetesteten Systeme (technische Schuld #2).

### Could Have
1. Prädator/Beute-Dynamik bei Tieren.
2. Krankheitssystem.
3. Dashboard/UI-Visualisierung.
4. Coverage-Tooling (technische Schuld #5).
5. Moderat größerer (weiterhin statischer) Weltgraph.
6. Partnerschaft als Fortpflanzungs-**Pflicht** (Klasse C — nur falls explizit als Breaking Change gewünscht).

### Explicitly Out of Scope
1. Echtzeit-/physikbasierte Bewegung, Mehrspieler/Netzwerk, Politik-/Kriminalitäts-/Kriegssysteme, NLP-Dialoge, Grafik-Engine-Integration, ML-gesteuertes Verhalten, verteilte/parallele Großskalierung (weiterhin per 01 §3.3 ausgeschlossen).
2. Echte Event-Reaktionsketten/Pub-Sub (ADR-06 bleibt).
3. Dependency-Graph-basierte Systemplanung (ADR-11 bleibt zurückgestellt).
4. Echter Mehrfach-Versions-Migrationspfad (ADR-10 bleibt, nur einfacher `schemaVersion`-Bump).
5. Haushalte als eigenständiges Aggregat mit eigener Pairing-Logik (Klasse D — zu tiefgreifend für v2, potenzieller Kandidat für eine spätere Version).
6. Dynamischer Weltgraph/Gebäudebau zur Laufzeit (bleibt zurückgestellt, unverändert seit 01/02/03).
7. Kapazitätsdurchsetzung an Orten (bleibt zurückgestellt).

---

## v2-Zielbild

Begründet ausschließlich durch die vorstehenden Entscheidungen: Die v2-Welt bleibt in Kernstruktur, Tick-Modell, Determinismus-Architektur und Persistenzformat identisch zu v1. Personen besitzen zusätzlich einen erweiterten Sozialgraphen (Partnerschaften) und — vorbehaltlich einer geklärten Versorgungsfrage — altersabhängiges Verhalten. Gebäude besitzen einen Verschleißzustand, der Wood als echten, zirkulierenden Wirtschaftsfaktor etabliert. Die Wirtschaft erhält optional eine zweite, dynamischere Marktstrategie und einfache Rollen. Animals, Movement, Event-Mechanismus (ADR-06), RNG-Architektur, Persistenzstrategie (ADR-10) und Fehlerarchitektur bleiben **unverändert** gegenüber v1, sofern nicht als explizite Could-Have-Ausnahme (Klasse C/D) gesondert entschieden.

---

## v2-Architektur — nur konzeptionell (keine Implementierungsentscheidung)

- **Bestehende Module bleiben erhalten**: `domain/`, `world/`, `simulation/`, `persistence/`, `observability/`, `config/`, `application/`, `presentation/`, `random/` — keine Schichtungsänderung erkennbar.
- **Module, die erweitert werden müssen**: `domain/components/` (neue Felder auf `Relationships`, ggf. neues `Role`-Component), `simulation/systems/` (`PopulationSystem` für Alters-/Beziehungsregeln, `ProductionSystem` oder ein neues System für Gebäudeverschleiß), `simulation/economy/` (`SupplyDemandMarket`), `config/` (neue Felder), `persistence/schema.ts` (neue Felder, `schemaVersion`-Bump).
- **Mögliche neue Module**: derzeit nicht identifiziert — alle betrachteten Optionen sind Erweiterungen bestehender Module, keine neue Infrastruktur-Kategorie.
- **Mögliche neue Interfaces/Ports**: derzeit nicht identifiziert (keine neue externe Abhängigkeit).
- **Potenzielle Kopplungsstellen**: `PopulationSystem` müsste `Relationships`-Erweiterung lesen (bereits heute der Fall für `parentIds`/`childIds`, kein neues Kopplungsmuster); `Work`-Action müsste ein Rollenfeld lesen (analog zu bestehendem `Identity`-Zugriff).
- **Noch nicht final entschieden** (Subtask 9): exakte Interface-Signaturen; ob Rollen ein Feld auf `Identity` oder ein eigenes Component werden; ob Gebäudeverschleiß ein neues System oder eine Erweiterung von `ProductionSystem` wird; ob Partnerschaft additiv (Klasse A) oder verpflichtend (Klasse C) für Fortpflanzung wird; exakte Event-Feldstrukturen.

Subtask 8 nimmt diese Entscheidungen ausdrücklich **nicht** vorweg.

---

## v2-Roadmap

1. **v2-Anforderungsbaseline** — dieses Dokument (abgeschlossen).
2. **Nachziehen der 3 fehlenden Integrationstests** (technische Schuld #1) — bewusst vor neuer Implementierung, damit die v1-Testbasis nicht mit wachsender v2-Komplexität weiter zurückfällt.
3. **Architekturentscheidungen** (Subtask 9, analog Subtask 2) — offene Interface-/Modulfragen aus dem vorigen Abschnitt klären, Versorgungsfrage für Kinder entscheiden, Partnerschafts-Pflicht vs. Priorisierung entscheiden.
4. **Domänenmodell-Erweiterung** (analog Subtask 3) — Components/Invarianten für Sozialgraph, Rollen, Gebäudeverschleiß.
5. **Kernsysteme** — kleinstmögliche additive Schritte zuerst (Wood-Sink, `SupplyDemandMarket`).
6. **Soziale Systeme** — Sozialgraph/Partnerschaft, inkl. der in Subtask 9 geklärten Pairing-Regel.
7. **Population** — altersabhängiges Verhalten, **nachdem** die Versorgungsfrage und die soziale Struktur stehen (Abhängigkeitsreihenfolge, nicht willkürlich).
8. **Wirtschaft/Rollen** — Jobs-/Rollen-Spezialisierung.
9. **Observability** — neue Events für alle neuen Systeme.
10. **Persistenz** — `schemaVersion`-Bump, Referenzintegrität für neue Felder.
11. **Empirische Validierung** (analog Subtask 5).
12. **Produktionsreife** (analog Subtask 6).
13. **v2-Freeze** (analog Subtask 7).

Begründung der Reihenfolge: rein additive, risikoarme Wirtschafts-Erweiterungen (Schritt 5) zuerst, weil sie kein bestehendes Verhalten ändern; die risikoreichere Altersregel (Schritt 7) erst, nachdem ihre Voraussetzung (Versorgungsfrage, Schritt 3) geklärt ist — nicht in willkürlicher Reihenfolge.

---

## Erfolgskriterien für v2

- Neues emergentes Verhalten (Wood-Zirkulation statt Akkumulation) tritt bei gleichem Seed reproduzierbar auf.
- Die bestehende Determinismus-Garantie bleibt für **alle** v1-Systeme erhalten (Regressionsprüfung: v1-typische Config liefert weiterhin dasselbe Verhalten wie vor v2, sofern keine als Klasse-C/D gekennzeichnete Änderung aktiv ist).
- Save/Load bleibt deterministisch, auch mit den neuen Feldern.
- Keine neuen Architekturzyklen (derselbe Dependency-Check wie in Subtask 4.1/6 wird für v2 erneut durchgeführt).
- Neue Systeme sind mindestens so gut getestet wie der v1-Durchschnitt — die bekannte Testlücke (technische Schuld #1/#2) wird durch v2 nicht vergrößert.
- Jeder neue Ressourcen-Sink/-Source besitzt eine über Events nachvollziehbare Quelle/Senke.
- Population zeigt weiterhin plausible, erklärbare Dynamik — insbesondere kein durch die Kinder-Versorgungsfrage ausgelöster unkontrollierter Kollaps.
- Keine unbeabsichtigten Runaway-Effekte, insbesondere bei der Wood-Verschleiß-Parametrisierung und einer etwaigen Prädator/Beute-Dynamik.
- Events erlauben weiterhin lückenlose Ursachenanalyse für jede neue Zustandsänderung.

---

## Finaler Konsistenzcheck (dieses Dokuments)

**v1**: Keine Datei unter `src/`, `tests/`, `docs/01-recherche-konzeption.md`, `docs/02-architektur.md` oder `docs/03-domaenenmodell.md` wurde durch diesen Subtask verändert. Keine v1-Regel wurde stillschweigend als v2-Anforderung umformuliert — jede Regel, die eine v1-Festlegung berührt, ist explizit als Klasse B/C/D bzw. „Behavior/Breaking Change ggü. v1" gekennzeichnet. Alle fünf technischen Schulden aus Subtask 6 wurden einzeln aufgegriffen und keine davon vergessen oder stillschweigend als „durch v2 automatisch erledigt" deklariert, außer wo explizit begründet.

**v2**: Jeder vorgeschlagene Punkt ist entweder mit einem v1-Befund, einer Subtask-5-Beobachtung oder einer externen Recherche-Erkenntnis begründet. Optionen und Bewertungen sind durchgängig von Entscheidungen getrennt — dieses Dokument trifft **keine einzige verbindliche v2-Entscheidung** (siehe „Wichtigste Abschlussregel" unten), sondern bereitet sie vor. Trade-offs (insbesondere Emergenzrisiken) sind dokumentiert. Scope ist in vier Kategorien realistisch gegliedert, Out-of-Scope ist explizit benannt. Architektur-, Persistenz- und Determinismusfolgen sind auf konzeptioneller Ebene beschrieben, ohne Subtask 9 vorwegzunehmen. Die Roadmap ist begründet (Abhängigkeitsreihenfolge, nicht willkürlich).

---

## Wichtigste Abschlussregel

- **Was ist v1 und eingefroren?** Alles in `01–03` (inkl. `03.5`), `src/`, `tests/`, der bestehenden Konfiguration und dem in Subtask 7 aktualisierten `README.md` — unverändert durch diesen Subtask.
- **Was ist für v2 verbindlich entschieden?** **Nichts.** Dieses Dokument enthält ausschließlich Recherche, Optionen, Bewertungen und eine Scope-Einordnung (Must/Should/Could/Out of Scope) — keine der genannten Optionen ist damit bereits eine verbindliche Architektur- oder Domänenentscheidung. Verbindliche Entscheidungen (Interface-Signaturen, exakte Regeln, Modul-Platzierung) sind ausdrücklich Subtask 9 vorbehalten.
- **Was ist lediglich eine mögliche zukünftige Idee?** Alle unter „Could Have" und „Explicitly Out of Scope" geführten Punkte, sowie jede Klasse-C/D-Option, die nicht in „Must Have"/„Should Have" gelistet ist.
