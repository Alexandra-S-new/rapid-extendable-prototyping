# Subtask 1 — Recherche- und Konzeptionsbericht: Living World Simulation Engine

> Status: Recherche/Konzeption abgeschlossen. **Kein produktiver Code.**
> Dient als Grundlage für die folgenden Architektur- und Implementierungs-Subtasks.

Legende für die Herkunft von Aussagen in diesem Dokument:

- **Erkenntnis** — etabliertes, gut belegtes Fachwissen (Simulationstheorie, Architekturmuster).
- **Annahme** — plausible Setzung für diesen PoC, die die weitere Planung vereinfacht, aber revidierbar ist.
- **Offen** — Entscheidung, die bewusst noch nicht getroffen wird (siehe Abschnitt 9).

---

## 1. Problemdefinition

Es soll eine **deterministische, agentenbasierte Simulation** einer kleinen autonomen Welt (Kleinstadt) entstehen. Die Kernschwierigkeit liegt nicht in einem einzelnen komplexen Algorithmus, sondern in der **Kombination mehrerer, sich gegenseitig beeinflussender Systeme** (Bedürfnisse, Wirtschaft, Umwelt, Fortpflanzung, Ereignisse), die

1. langfristig **erweiterbar** sein müssen, ohne bestehenden Code anzufassen,
2. **reproduzierbar** laufen müssen (gleicher Seed → identischer Verlauf),
3. **beobachtbar** bleiben müssen, damit emergentes Verhalten nachvollziehbar ist, statt eine Black Box zu sein,
4. **persistierbar** sein müssen (Speichern/Laden eines vollständigen Weltzustands).

Das eigentliche Risiko eines solchen Projekts ist nicht "kann ich eine Simulation schreiben", sondern "bricht die Architektur, sobald das dritte oder vierte System dazukommt". Der Bericht ist entsprechend stark auf **Architekturprinzipien, die Erweiterbarkeit und Determinismus strukturell erzwingen**, statt auf Feature-Vollständigkeit ausgerichtet.

## 2. Ziel des PoC

Ein **PoC, der professionelle Software-Engineering-Standards demonstriert**, nicht ein möglichst feature-reiches Simulationsspiel. Konkret soll der PoC zeigen:

- eine klare, modulare Architektur (Entities/Components/Systems, Event Bus, World State),
- dass neue Domänen (z. B. ein neues Tiersystem) **additiv** integrierbar sind,
- dass die Simulation bei gleichem Seed **bitidentisch** reproduzierbar ist (durch einen Test belegt, nicht nur behauptet),
- ein vollständiges Save/Load mit Versionierung,
- Beobachtbarkeit (Logs, Event-History, Statistiken, Entity-Inspektion),
- eine Testsuite, die Systemverhalten, Integrationsverhalten und Determinismus absichert.

Die Codemenge (~2000+ Zeilen) ist eine **Folge** dieses Anspruchs (mehrere Systeme, Tests, Persistenz, Observability), nicht ein Ziel, auf das hin Features erfunden werden.

## 3. Funktionale Anforderungen

### 3.1 Muss (PoC-Kern)

| Bereich | Anforderung |
|---|---|
| Zeit | Tick-basierte Uhr; Tageszeit, Tag, Jahreszeit aus Tick ableitbar |
| Welt | Abstrakte Orte (Graph, keine 2D/3D-Koordinaten), Gebäude an Orten |
| Personen | Bedürfnisse (Hunger, Energie, Sozial), utility-basierte Handlungswahl, Bewegung zwischen Orten |
| Tiere | Eigener Agententyp mit reduziertem Bedürfnis-Set, beweist Erweiterbarkeit über Personen hinaus |
| Wirtschaft | Mind. 2 Ressourcentypen, einfache Produktion/Konsum, einfacher Markt/Tausch |
| Bevölkerung | Alterung, Tod (Hunger/Alter), einfache Fortpflanzung |
| Ereignisse | Event Bus + persistente Event-History (Geburt, Tod, Handel, Ernte, …) |
| Persistenz | Vollständiger Weltzustand speicher- und ladbar, inkl. Versionsnummer |
| Determinismus | Seed → identischer Verlauf, durch automatisierten Test verifiziert |
| Observability | Strukturierte Logs, aggregierte Statistiken, Entity-Inspektion |
| Tests | Unit-Tests je System, Integrationstest über N Ticks, Determinismus-Test |

### 3.2 Sinnvolle Erweiterungen (bewusst zurückgestellt, Architektur muss sie zulassen)

Beziehungen/Sozialgraph über Eltern-Kind hinaus, Job-/Arbeitsmarkt-Matching, Wettereffekte auf Ernte/Gebäude, Krankheitssystem, mehrere Ressourcen mit Preisschwankung, mehrere Tierarten inkl. Prädator/Beute, GOAP-artige Planung für Agenten, Dashboard/UI-Visualisierung.

### 3.3 Bewusst nicht vorgesehen

Echtzeit-/physikbasierte Bewegung und Pathfinding (A\*, Navmesh), Mehrspieler/Netzwerksimulation, Politik-/Kriminalitäts-/Kriegssysteme, NLP-Dialogsysteme, Grafik-/Game-Engine-Integration, ML-gesteuertes Agentenverhalten, große Skalen (>1000e Agenten) mit verteilter/paralleler Ausführung.

Begründung für den letzten Punkt: Parallelität und Nicht-Determinismus stehen in direktem Konflikt mit Anforderung 3.1 "Determinismus" — bei der Zielgröße (100–300 Personen, 50–150 Tiere) ist Parallelität ohnehin nicht nötig (siehe Abschnitt 8, Performance).

## 4. Nichtfunktionale Anforderungen

- **Modularität**: neue Domäne = neue Komponente(n) + neues/e System(e), keine Änderung bestehender Systeme (Open/Closed Principle als hartes Kriterium, nicht nur Empfehlung).
- **Testbarkeit**: Systeme sind (möglichst) reine Funktionen über `WorldState`; RNG und Uhr sind injizierbar, nicht global.
- **Typisierung**: starke, statische Typisierung; Domänenbegriffe (Season, NeedType) als Enums/Value-Types statt Strings/Magic Numbers.
- **Determinismus** als Querschnittsanforderung, nicht als einzelnes Feature (betrifft RNG, Iterationsreihenfolge, Persistenz, siehe Abschnitt 5.4).
- **Beobachtbarkeit**, ohne die Simulation selbst zu beeinflussen (Observer-Pattern, rein lesend).
- **Performance** für die Zielgröße ausreichend, **keine** vorzeitige Optimierung (siehe Abschnitt 8).
- **Konfigurierbarkeit**: Simulationsparameter (Startpopulation, Bedürfnis-Zerfallsraten, Ticklänge) extern konfigurierbar statt hartkodiert.
- **Wartbarkeit/Dokumentation**: jedes System dokumentiert Zweck, Lese-/Schreibzugriffe auf Komponenten und Position in der Ausführungsreihenfolge.

## 5. Vorgeschlagenes Simulationsmodell

### 5.1 Agentenmodell (Bezug: Untersuchungsbereich 1)

**Erkenntnis:** Für kleine, verständliche Simulationen mit glaubwürdigem, aber nicht "intelligentem" Verhalten hat sich ein **utility-basiertes Bedürfnismodell** (bekannt aus *Die Sims*/"Smart Terrain") bewährt: Jeder Agent hat Bedürfnisse (Hunger, Energie, Sozial, …), die über Zeit zerfallen. Für jede mögliche Handlung wird ein Nutzenwert relativ zum aktuellen Bedürfniszustand berechnet; die Handlung mit dem höchsten Nutzen wird gewählt.

Verglichene Alternativen:

| Modell | Bewertung für diesen PoC |
|---|---|
| Reine FSM (State Machine) | Zu starr; jede neue Kombination von Zuständen erfordert neue Übergänge — skaliert schlecht mit mehr Bedürfnissen/Systemen |
| **Utility-AI (Bedürfnisse → Aktionsbewertung)** | **Empfehlung.** Dezentral (jeder Agent bewertet unabhängig), linear erweiterbar (neues Bedürfnis = neue Kurve + Aktionsbewertung), deterministisch, gut testbar (reine Bewertungsfunktion) |
| GOAP (Goal-Oriented Action Planning) | Mächtiger, aber Suchraum-basiert → schwerer deterministisch/performant zu halten, Overkill für PoC-Umfang |
| BDI (Belief-Desire-Intention) | Akademisch mächtig, aber Implementierungsaufwand steht in keinem Verhältnis zum PoC-Nutzen |

**Empfehlung:** Hybrid aus **FSM für die Ausführung** einer gewählten Aktivität (z. B. "Traveling", "Working", "Sleeping" als expliziter Zustand mit Dauer) und **Utility-AI für die Auswahl**, welche Aktivität als nächstes begonnen wird. Damit bleibt die Entscheidung einfach und deterministisch, während die Ausführung über mehrere Ticks hinweg saubere Zustandsübergänge hat.

Interaktionen: **direkte** Interaktionen (Handel, minimaler Dialog-Trigger) und **indirekte** Interaktionen über gemeinsam genutzten Weltzustand (Ressourcenknappheit, Marktpreise) werden unterstützt — letztere sind der eigentliche Hebel für emergentes Verhalten (z. B. Hungersnot durch Übernutzung eines Feldes), ohne dass Agenten "wissen", was andere Agenten tun.

**Grenzen/typische Probleme (Erkenntnis)**, die bewusst mitgedacht werden:
- Oszillation bei knapp beieinanderliegenden Nutzenwerten (Agent wechselt jeden Tick die Aktivität) → Gegenmaßnahme: Hysterese/Mindestdauer pro Aktivität.
- Emergenz kann Ursache-Wirkung verschleiern → wird durch Event-History/Observability (Abschnitt 5.5, Bereich 8) adressiert, nicht durch Verzicht auf Emergenz.
- O(n²)-Interaktionskosten bei "wer ist in der Nähe" → durch abstrakte, diskrete Orte (statt Koordinatenraum) strukturell vermieden.

### 5.2 Architekturmodell (Bezug: Untersuchungsbereich 2)

**Empfehlung: ECS-lite** (von Entity-Component-System inspiriert, kein vollständiges Hochleistungs-ECS-Framework):

- **Entity** = stabile ID (fortlaufender, deterministisch vergebener Zähler — **keine** GUIDs, **keine** Speicheradressen).
- **Component** = reine Daten, gruppiert nach Fachlichkeit (`Position`, `Needs`, `Inventory`, `Age`, `AIState`, …).
- **System** = Funktion/Klasse, die je Tick über die relevanten Komponentenspeicher iteriert; **keine** Vererbungshierarchie von Verhalten.

Verglichene Alternativen:

| Ansatz | Bewertung |
|---|---|
| OOP-Vererbungshierarchie (`Person extends Agent extends Entity`) | Einfacher Einstieg, aber "fragile base class"-Problem; neue Querschnittsfunktion (z. B. Krankheit für Menschen *und* Tiere) erzwingt Änderung der Basisklassen |
| **ECS-lite (Komponenten + Systeme)** | **Empfehlung.** Neue Domäne = neue Komponente + neues System, bestehender Code unverändert; passt strukturell zur Erweiterbarkeitsanforderung |
| Actor-Modell (Agenten als unabhängige Prozesse/Threads) | Gut für Nebenläufigkeit, aber Nachrichtenreihenfolge/Timing ist von Natur aus schwer deterministisch zu halten — **Widerspruch zur Kernanforderung Determinismus**, daher verworfen |

- **Simulationsuhr**: diskrete, Tick-basierte Simulation (kein Echtzeit-, kein reines Discrete-Event-System). 1 Tick = feste simulierte Zeiteinheit. Ein leichtgewichtiger "in N Ticks ausführen"-Scheduler kann **auf** der Tick-Schleife aufgesetzt werden (für z. B. geplante Ernten), ersetzt sie aber nicht.
- **Systeme/Reihenfolge**: feste, explizite Ausführungsreihenfolge, gruppiert in **Phasen** (z. B. `Perception → Decision → Action → Resolution → Cleanup`). Eine automatische Abhängigkeits-Auflösung (topologische Sortierung) wird **bewusst nicht** für den PoC gebaut (Komplexität durch Zyklenerkennung/Phasenverwaltung steht in keinem Verhältnis zum Nutzen bei einer Handvoll Systemen) — als spätere Erweiterung dokumentiert (Abschnitt 9).
- **World State**: eine zentrale `WorldState`-Instanz als Single Source of Truth (Entity-Register, Komponentenspeicher, globaler Zustand wie Wetter/Jahreszeit). Kein verstecktes globales Mutable State anderswo.
- **Event Bus**: synchrone, In-Tick-Ereigniswarteschlange. Ereignisse werden während eines Ticks in fester Emissionsreihenfolge gesammelt und in einer dedizierten Resolution-Phase (oder zu Beginn des nächsten Ticks) verarbeitet — **kein** asynchroner/threaded Bus, da das Nichtdeterminismus einführen würde.
- **Deterministische Zufallszahlen**: ein seedbarer PRNG, aus dem **benannte Substreams** abgeleitet werden (z. B. `hash(seed, "weather")`, `hash(seed, "agent-decision", entityId)`), statt eines einzigen globalen Streams. Begründung: verhindert, dass das Hinzufügen/Entfernen eines Features die Zufallsfolge *anderer*, fachlich unabhängiger Systeme verschiebt ("Schmetterlingseffekt" beim Erweitern) — ein häufiger, sonst unauffälliger Determinismus-Bug.

### 5.3 Domänenobjekte (Bezug: Untersuchungsbereich 4)

Gegenüber der Ausgangsliste im Auftrag: `Item/Good` wird mit `Resource` zusammengelegt (kein eigenständiger Mehrwert bei PoC-Umfang), `Job`/vollständiger `Relationship`-Graph werden in die "sinnvolle Erweiterung"-Kategorie verschoben (siehe 3.2), da sie für den Kern-PoC nicht zwingend sind, aber die Architektur sie ohne Bruch aufnehmen muss.

Kern-Domänenglossar:

- **World** — Aggregat aus Uhr, RNG-Zustand, Entity-Register, globalem Zustand (Wetter, Jahreszeit).
- **SimulationClock** — Tick-Zähler; Tageszeit/Tag/Jahreszeit werden daraus abgeleitet, nicht separat verwaltet.
- **Person / Animal** — Entities mit Komponentenbündeln: `Identity`, `Position` (Ort-Referenz), `Needs`, `Inventory` (optional), `Age`, `AIState`.
- **Location** — Knoten im Weltgraph (Siedlung, Feld, Wald, Marktplatz), hält Kapazität/Eigenschaften.
- **Building** — Struktur an einem Ort mit Funktion (Haus, Farm, Markt, Arbeitsstätte).
- **Resource** — Ressourcen-/Gütertyp (Nahrung, Holz, Geld-Abstraktion); `Inventory` hält Mengen je Ressourcentyp.
- **Need** — Bedürfnistyp mit Zerfallsrate und zugeordneten befriedigenden Aktionen.
- **Action** — bewertbare Handlung (Essen, Schlafen, Arbeiten, Reisen, Sozialisieren, Handeln).
- **Market** — Tauschmechanismus zwischen Agenten/Gebäuden; als austauschbare Strategie entworfen (siehe 6).
- **Weather / Season** — globaler, zyklischer Umweltzustand mit Wirkung auf andere Systeme.
- **Event / EventBus / EventLog** — diskrete Vorkommnisse (Geburt, Tod, Ernte, Handel) + deren Historie.
- **Relationship** (minimal: Eltern-Kind) — notwendig für Fortpflanzung; erweiterbarer Sozialgraph ist Erweiterung.
- **SaveGame/Snapshot** — serialisierter Weltzustand inkl. Versions-Metadaten.

### 5.4 Determinismus (Bezug: Untersuchungsbereich 5)

**Anforderungen:**

1. Seedbasierter RNG mit benannten Substreams (siehe 5.2).
2. Feste Systemreihenfolge, unabhängig von Betriebssystem/Scheduling.
3. Stabile, sequenziell vergebene Entity-IDs (Teil des persistenten Weltzustands).
4. **Kontrollierte Iterationsreihenfolge**: Iteration über Entities immer in stabiler Ordnung (z. B. nach ID sortiert) — **niemals** über die native Iterationsreihenfolge von Hashmaps/Sets, da diese sprachabhängig nicht garantiert ist.
5. Persistenz muss **alles** umfassen, was künftige Schritte beeinflusst — inkl. des internen RNG-Zustands (nicht nur des ursprünglichen Seeds), damit ein Spielstand exakt an derselben Stelle fortgesetzt werden kann.
6. Reproduzierbare Fehler: Ein Bug bei Tick N mit Seed S muss durch Replay von Seed S bis Tick N exakt erneut auftreten — daher keine Nutzung von Wanduhrzeit/Systemzeit in der Logik (nur in Log-Metadaten erlaubt).

**Typische Fehlerquellen, die Determinismus unbemerkt brechen (Erkenntnis):**

1. Nutzung des globalen/Default-RNG statt der geseedeten Instanz (z. B. versehentlich in einer Hilfsfunktion).
2. Iteration über Hash-basierte Collections ohne explizite Sortierung.
3. Verwendung von Wanduhrzeit/Systemzeit in der Simulationslogik.
4. Plattform-/Compiler-abhängige Fließkomma-Abweichungen (**Annahme:** für den PoC wird Determinismus nur *innerhalb derselben Plattform/Runtime* gefordert, nicht cross-platform-bitidentisch — Cross-Platform-Determinismus wäre ein deutlich größerer Aufwand und ist für den PoC-Zweck nicht notwendig).
5. Parallele/nebenläufige Systemausführung mit nicht deterministischer Ablaufreihenfolge.
6. Externe I/O oder umgebungsabhängiger Zustand (z. B. Locale-abhängige String-Sortierung), der in die Logik einfließt.
7. Mutation gemeinsamen Zustands während der Iteration darüber (reihenfolgeabhängige Seiteneffekte).
8. Verlust von RNG-Zustand oder ID-Zähler beim Speichern/Laden → Divergenz nach Reload.
9. Verwendung von Objektidentität/Einfügereihenfolge einer nicht-geordneten Struktur als impliziter Sortierschlüssel.

**Empfehlung:** ein automatisierter **Determinismus-Test** als festes Element der Testsuite: gleicher Seed zweimal für N Ticks ausführen, resultierenden Weltzustand hashen/vergleichen, Gleichheit erzwingen. Dieser Test wird zur Design-Randbedingung, nicht nur zur nachträglichen Prüfung.

### 5.5 Beobachtbarkeit (Bezug: Untersuchungsbereich 8)

- **Logging**: strukturiert, leveled (debug/info/warn/error), getaggt mit System und Tick; über eine schmale Logging-Abstraktion, nicht direkt `console`-Aufrufe in der Fachlogik.
- **Statistiken**: ein rein lesender `Observer`/`Statistics`-Baustein aggregiert Metriken (Population, durchschnittliche Bedürfnisbefriedigung, Ressourcenstände, Geburten/Todesfälle) — **beeinflusst den Weltzustand nicht**, um Observability nicht versehentlich zur Determinismus-Falle zu machen.
- **Event-History**: der Event Bus persistiert (begrenzt) eine Historie emittierter Ereignisse mit Tick-Zeitstempel — Hauptwerkzeug, um emergentes Verhalten nachträglich zu erklären ("warum ist Person 42 gestorben" → Event-Log durchsuchen).
- **Entity-Inspektion**: Möglichkeit, den vollständigen Komponentenzustand einer einzelnen Entity zu einem gegebenen Tick abzufragen (CLI/Dev-Kommando reicht für den PoC, kein GUI-Zwang).
- **Reproduzierbare Fehlerberichte**: bei einem Systemfehler werden Seed, Tick und betroffene Entity-IDs im Fehlerkontext erfasst, sodass der Fehler exakt reproduziert werden kann — direkte Konsequenz aus 5.4.

## 6. Vorgeschlagener Scope

Siehe Abschnitt 3.1–3.3 für die vollständige Aufschlüsselung. Zusammengefasst als Faustregel für die Abgrenzung: **Ein Feature gehört in den Kern, wenn es nötig ist, um mindestens eines der folgenden Dinge zu demonstrieren — Erweiterbarkeit, Determinismus, Persistenz oder Beobachtbarkeit. Alles andere ist Erweiterung oder explizit ausgeschlossen.** Das verhindert Feature-Wildwuchs nur zur Erreichung der 2000-Zeilen-Marke.

Zusätzlicher Baustein, der über die ursprüngliche Liste hinausgeht: **Market als austauschbare Strategie** (Interface statt konkreter Implementierung) — nicht weil der PoC mehrere Marktmodelle *braucht*, sondern weil er als konkretes, kleines Beispiel für "neues Wirtschaftsmodell ohne Änderung bestehender Systeme" (Untersuchungsbereich 6) dient und damit die Erweiterbarkeitsbehauptung greifbar macht.

## 7. Relevante Architekturprinzipien

1. **Open/Closed Principle strukturell erzwungen** durch Komponenten+Systeme statt Vererbung: neue Fachlichkeit = neue Komponente(n)/System(e), keine Änderung bestehender Systeme.
2. **Single Source of Truth**: ein `WorldState`, kein verteilter/versteckter Zustand.
3. **Explizite, deterministische Ausführungsreihenfolge** statt impliziter/automatischer Nebenläufigkeit.
4. **Reine, testbare Systemfunktionen**: Uhr und RNG werden injiziert, nicht global bezogen.
5. **Entkopplung über Events statt direkter Kopplung** zwischen Systemen, die nicht in derselben Phase laufen.
6. **Beobachtbarkeit als Seiteneffekt-freier Querschnitt**: Observer lesen, verändern nie.
7. **Explizite Schnittstellen an Erweiterungspunkten** (z. B. Action-Scorer-Interface, Market-Strategie-Interface) statt Änderung an Kernklassen — Erweiterung durch Komposition.
8. **Fail-fast an Systemgrenzen** (Config-Laden, Save-Laden): Validierung vor Übernahme in den aktiven Zustand, keine stillen Teilfehler.

## 8. Risiken und technische Herausforderungen

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| Determinismus wird durch unauffällige Details gebrochen (Hashmap-Iteration, globaler RNG) | Reproduzierbarkeit — die Kernanforderung — ist nicht mehr gegeben, oft erst spät entdeckt | Determinismus-Test von Anfang an in der Testsuite (Abschnitt 5.4); Code-Review-Checkliste für die 9 genannten Fehlerquellen |
| Utility-AI führt zu Oszillation/unplausiblem Verhalten | Emergentes Verhalten wirkt kaputt statt interessant | Hysterese/Mindestdauer je Aktivität; Beobachtung über Event-History |
| Überengineering der Erweiterbarkeit (z. B. generischer Dependency-Graph-Scheduler von Anfang an) | Zeitverlust, Komplexität ohne PoC-Nutzen | Bewusst zurückgestellt (Abschnitt 9), explizite Reihenfolge reicht für die geplante Systemanzahl |
| Save/Load verliert impliziten Zustand (RNG, ID-Zähler) | Divergenz nach Reload, schwer zu debuggen | RNG-Zustand und ID-Zähler sind expliziter Teil des Snapshots, nicht implizit rekonstruiert |
| Emergenz ist nicht erklärbar ("Black Box") | Widerspricht explizit der Aufgabenstellung | Event-History + Entity-Inspektion + Statistiken als Pflichtbestandteil, nicht optional |
| Scope-Kriechen zur Erreichung der Zeilenzahl | Unnötige Komplexität, schlechtere Codequalität | Faustregel aus Abschnitt 6 als Abgrenzungskriterium |
| Persistenzformat ohne Versionierung | Spätere, inkompatible Änderungen brechen alte Spielstände unbemerkt | Pflicht-Versionsfeld + strikte Ablehnung bei Inkompatibilität (Abschnitt 9) |

## 9. Offene Architekturentscheidungen

Diese Punkte werden hier bewusst **nicht** entschieden, sondern für Subtask 2 vorbereitet — inkl. einer vorläufigen Tendenz, wo sinnvoll:

1. **Programmiersprache/Runtime.** Nicht Teil dieses Repos bisher (kein Manifest vorhanden). Tendenz: **TypeScript/Node.js** — starke statische Typisierung, native JSON-Persistenz, gute Testtooling (z. B. Vitest), gut geeignet, um "professionelle Standards" sichtbar zu demonstrieren. Alternativen: Python (schneller lesbar, aber schwächere statische Typisierung ohne zusätzliche Disziplin/mypy), Rust (stärkste Determinismus-/Performance-Garantien, aber deutlich höherer Implementierungsaufwand für einen PoC). **Endgültige Wahl folgt in Subtask 2.**
2. **Save-Format-Details**: JSON als Klartext-Format ist naheliegend (Lesbarkeit/Debugbarkeit, Größe bei dieser Skala irrelevant) — aber die konkrete Schema-Validierungsbibliothek/-Strategie ist offen.
3. **Migrationsstrategie für Savegames**: einfache Kette von v_n→v_n+1-Migrationsfunktionen vs. strikte Ablehnung inkompatibler Versionen ohne Migration im PoC. Tendenz: strikte Ablehnung für den PoC, Migration als dokumentierte Erweiterung.
4. **Dependency-basierte Systemplanung**: explizite feste Reihenfolge (empfohlen für den PoC) vs. automatische topologische Sortierung von System-Abhängigkeiten — zurückgestellt, bis die Systemanzahl es rechtfertigt.
5. **Umfang der Event-History**: unbegrenzt vs. begrenzt/rollierend — Tendenz: begrenzt (z. B. letzte N Ticks vollständig, älter nur aggregiert), um Speicherwachstum bei langen Läufen zu vermeiden; genaue Grenze offen.
6. **Granularität der Orte**: reiner Graph diskreter Orte (empfohlen) vs. grobes Raster mit Koordinaten — Graph vermeidet Pathfinding-Komplexität vollständig und ist für die Zielgröße ausreichend; endgültig zu bestätigen in Subtask 2.
7. **Testframework/Tooling**-Wahl folgt aus Entscheidung 1.

## 10. Begründete Empfehlungen

1. **ECS-lite-Architektur** (Entities als IDs, Components als Daten, Systeme in festen Phasen) statt OOP-Vererbung oder Actor-Modell — einziger Ansatz, der Erweiterbarkeit *und* Determinismus gleichzeitig strukturell absichert.
2. **Utility-basierte Bedürfnis-KI** mit FSM-Ausführungsschicht statt GOAP/BDI — bestes Verhältnis von glaubwürdigem emergentem Verhalten zu Implementierungs- und Debugging-Aufwand für die Zielgröße.
3. **Tick-basierte, streng geordnete Simulation** mit synchronem In-Tick-Event-Bus statt Echtzeit- oder asynchroner Verarbeitung — einzige Variante, die Determinismus ohne Zusatzaufwand garantiert.
4. **Seedbasierter RNG mit benannten Substreams** statt einem globalen Stream — verhindert, dass künftige Erweiterungen (Subtask-Ziel!) bestehende Zufallsverläufe verschieben.
5. **Abstrakte, diskrete Orte statt Koordinatenraum** — vermeidet Pathfinding/Spatial-Indexing-Komplexität, die bei dieser Zielgröße keinen Mehrwert hätte (bewusster Verzicht auf verfrühte Optimierung, siehe Abschnitt 8).
6. **Observer-Pattern für Statistik/Logging**, strikt lesend — verhindert, dass Beobachtbarkeit selbst zu einer Determinismus- oder Kopplungsquelle wird.
7. **Determinismus- und Reproduzierbarkeits-Test als Pflichtbestandteil der Testsuite von Anfang an**, nicht nachträglich — die Kernanforderung des Auftrags lässt sich sonst nicht verlässlich belegen.
8. **Scope-Abgrenzung über die Faustregel aus Abschnitt 6** statt einer festen Feature-Liste — hält den PoC bei ausreichender, aber nicht künstlich aufgeblasener Komplexität.
9. **Sprachentscheidung (TypeScript-Tendenz) explizit erst in Subtask 2 fixieren** — dieser Bericht bleibt technologieneutral, wo es die Aufgabenstellung zulässt, und benennt nur eine begründete Tendenz.

---

*Nächster Schritt: Subtask 2 (Architekturplanung) auf Basis der Empfehlungen in Abschnitt 10 und der offenen Entscheidungen in Abschnitt 9.*
