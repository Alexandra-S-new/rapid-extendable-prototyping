# Subtask 22 — Produkt- und UX-Konzeption: Die Living World als erlebbare Anwendung

> Status: Konzeptionssubtask. **Kein produktiver Code.** Baut verbindlich auf der eingefrorenen V1/V2/A1-Simulation und der eingefrorenen Observation-/Application-Architektur (Subtask 19–21) auf. Diese enthält keinen Code, keine neuen Dependencies, keine Änderung an `domain/`, `world/`, `simulation/`, `application/`, `observability/`, `persistence/`.

Legende wie in den Vorgänger-Dokumenten: **Erkenntnis** (aus dem Code verifiziert) · **Annahme** (bewusste, revidierbare Setzung) · **Empfehlung** (Entscheidung dieses Subtasks) · **Offen** (echte, noch zu treffende Entscheidung, siehe 26.19).

---

## 26.1 Gesamtbefund

> **PRODUKT-/UX-KONZEPT DEFINIERT — BEREIT FÜR IMPLEMENTIERUNG**

Alle zentralen Produktentscheidungen (Rolle der Nutzerin, Kern-Reiz, Informationshierarchie, Technologie, MVP-Umfang) sind aus dem tatsächlichen, code-verifizierten Domänenmodell abgeleitet und mit der eingefrorenen Architektur (Subtask 19–21) verträglich. Ein einzelner, klar benannter Punkt (abgeleitete Kalenderanzeige, siehe 26.15) würde eine minimale, optionale Application-Erweiterung benötigen — der MVP kommt ohne sie aus und ist damit vollständig ohne jede neue Domänen- oder Application-Logik umsetzbar.

---

## 26.2 Ausgangsbasis — tatsächlich vorgefundene technische Möglichkeiten

Verifiziert direkt am Code (nicht aus früheren Berichten übernommen):

**Vorhanden und nutzbar, ohne etwas zu ändern:**

- `SimulationController`: `start()/pause()/resume()/step(n)/setSpeed(hz)/getStatus()/getObserver()/save()/load()`. Kein Zugriff auf den rohen `WorldState` möglich — jede Presentation-Schicht ist strukturell auf `ControllerStatus` (Primitive) und `WorldObserver` (Kopien) beschränkt.
- `WorldObserver`: `getWorldSnapshot()`, `getPersonObservation(id)`, `getAnimalObservation(id)`, `getLocationObservation(id)`, `getRecentEvents({last?, type?})`. Liefert **echte, unabhängige Kopien** — bidirektional gegen Mutation abgesichert (in Subtask 21 empirisch verifiziert, auch für verschachtelte Strukturen).
- `WorldSnapshot` enthält bereits: Tick, Season, Weather, alle Orte (Name, Personen-/Tieranzahl, Gebäude mit `kind`/`condition`), alle lebenden Personen (Identität, Rolle, Alter, LifeStage, Ort, Bedürfnisse, Aktivität, Partner, Freunde, Eltern, Kinder), alle lebenden Tiere (analog ohne Partner/Freunde/Sozialbedürfnis), sowie Event-History.
- `SimEvent`: genau **sieben** Varianten — `BirthEvent`, `DeathEvent`, `TradeEvent`, `HarvestEvent`, `MovementEvent`, `SeasonChangedEvent`, `WeatherChangedEvent`, `BuildingConditionChangedEvent`. Discriminated Union, erschöpfend.
- Orts-Graph: statisch, klein (Default: 4 Orte), **abstrakt** — `{ id, name, connections: {to, travelTicks}[], buildingIds }`. Keine Koordinaten, kein Gelände, keine Geografie. `PathTable` berechnet Reiserouten bereits intern (Agenten reisen selbstständig) — für die Presentation ist das kein Thema, sie sieht nur `locationId`.
- Persistenz: `RawStorage`-Port + `FileRawStorage`-Adapter; Presentation wählt nur die Storage-Implementierung, rührt Schema/Serialisierung nie direkt an (Schema-Version 3, eingefroren).
- Zeit: `ControllerStatus.currentTick` (Simulationszeit) ist strikt getrennt von der Wall-Clock-Kadenz (`ticksPerSecond`/`TickScheduler`) — in Subtask 21 empirisch bestätigt: Geschwindigkeit verändert nachweislich nur das *Wann*, nie das *Was*.
- `tsconfig.json`: `strict`, `NodeNext`-ESM, `types: ["node"]` — reines Node/TS ohne jede Browser-/Frontend-Tooling-Spur. `package.json`: einzige Runtime-Dependency ist `zod`; `tsx`/`typescript`/`vitest` als Dev-Tooling. Kein UI-Framework, kein HTTP-Server, keine Build-Pipeline für Browser-Code vorhanden.

**Ausdrücklich NICHT vorhanden (und laut Subtask-22-Auftrag nicht zu erfinden):**

- Keine Möglichkeit, eine Person direkt zu bewegen, ihre Bedürfnisse zu verändern, eine Beziehung/Partnerschaft/Freundschaft zu erzwingen, eine Rolle zuzuweisen, Wetter/Ressourcen manuell zu setzen. Jede Zustandsänderung an einer Entity entsteht ausschließlich aus der Utility-AI der Simulation selbst.
- Kein Event für "Freundschaft entstanden" oder "Partnerschaft entstanden" — `SocialBondingSystem` und `PopulationSystem` verändern `Relationships` direkt, ohne ein `SimEvent` zu emittieren. Beziehungsänderungen sind **nicht** im Event-Feed sichtbar (wichtige Konsequenz, siehe 26.12).
- Keine öffentliche Möglichkeit für die Presentation-Schicht, nach einem `load()` an die aufgelöste `SimulationConfig` zu kommen (z. B. `ticksPerDay`/`daysPerSeason`/`seed`) — `SimulationController` exponiert `getConfig()` nicht. Relevant für 26.15/26.19.
- Bestehende `EntityInspector` (in `observability/`) liefert **rohe, mutable** Component-Referenzen (bewusst so dokumentiert, im Unterschied zu `WorldObserver`) — für jede neue Oberfläche ausschließlich `WorldObserver` verwenden, nie `EntityInspector`.

---

## 26.3 Produktvision

**Was ist die Anwendung — präzise, nicht als "Simulation mit Oberfläche":**

> Living World ist ein kleines, sich selbstständig entwickelndes Gemeinwesen aus Menschen und Tieren an einer Handvoll verbundener Orte, das die Nutzerin über beliebig lange Zeit **beobachtet, verweilt und immer wieder aufsucht** — wie ein Aquarium oder ein gut geführtes Ameisenhaus, nicht wie ein Strategiespiel. Sie bestimmt, *wie schnell* und *wohin* sie schaut; sie bestimmt nie, *was passiert*. Der Reiz entsteht daraus, dass sich aus einfachen, für sich genommen unspektakulären Regeln (Bedürfnisse, Nähe, Zeit) über viele Ticks hinweg **einzelne, wiedererkennbare Lebensgeschichten** herausbilden — wer mit wem befreundet ist, wer eine Familie gründet, wer einen Winter nicht überlebt, wie ein Ort wächst oder verödet.

Das ist bewusst **kein** "Simulation mit UI davor" (das würde bedeuten: alle Rohdaten sichtbar machen) und **kein** klassisches Aufbau-/Strategiespiel (das würde direkte Kontrolle über Entities voraussetzen, die im Domänenmodell nicht existiert und laut Auftrag nicht erfunden werden darf).

### 26.4 Rolle der Nutzerin

Bewertung der vorgegebenen Optionen anhand des tatsächlichen Domänenmodells:

| Rolle | Trägt das Domänenmodell das? |
|---|---|
| **Beobachterin** | Ja, vollständig — jede Interaktion außer Zeitsteuerung und Save/Load ist eine reine Observation Query. |
| **Entdeckerin** | Ja — Auswahl/Navigation (Welt → Ort → Person) ist bereits heute genau dafür da; nichts davon verändert den Weltzustand. |
| **Chronistin** | Teilweise, als Nebenrolle — Save/Load und die Event-History erlauben, Momente festzuhalten und später Geschichte nachzuvollziehen; das ist aber eine Funktion der Beobachterinnen-Rolle, keine eigenständige Interaktionsart. |
| **Indirekte Lenkerin** | Nein, nicht tragfähig — es gibt keinen einzigen Hebel (auch keinen "weichen"), mit dem die Nutzerin einen Simulationsausgang beeinflussen könnte, ohne neue Domänenlogik zu erfinden. Speed/Pause/Step sind reine Wahrnehmungssteuerung, keine Einflussnahme auf Ergebnisse. |
| **Klassische Spielerin** | Nein — es gibt keine Ziele, keine Ressourcen der Nutzerin selbst, keine Aktionen, die sie einer Entity zuweisen könnte. Diese Rolle zu erfinden würde neue Domänenlogik erfordern, was explizit ausgeschlossen ist. |

**Entscheidung: Beobachterin + Entdeckerin, mit Chronistin als Nebenfacette.** Die Nutzerin schaut zu, wählt, wohin sie schaut, bestimmt das Tempo dieses Zuschauens, und kann Momente sichern (Save) bzw. zu ihnen zurückkehren (Load). Sie greift nie in eine einzelne Entity ein.

### 26.5 Zentraler Reiz — Priorisierung

Nicht alles im Domänenmodell ist gleich reizvoll. Bewertung:

| Kandidat | Bewertung |
|---|---|
| **Lebensläufe & Beziehungen** (Kind → Erwachsene → Partnerschaft → Kinder → Alter/Tod; Freundschaften über gemeinsames Socializing) | **Primärer Reiz.** Einzige Domänen-Elemente, die über Zeit eine wiedererkennbare, personenzentrierte Geschichte ergeben. Age/LifeStage/Relationships/Events greifen hier ineinander. |
| **Emergente Ereignisse** (die 7 SimEvent-Typen, chronologisch) | **Primäres Werkzeug, nicht eigener Reiz** — der Event-Feed ist das Bindegewebe, das Lebensläufe/Beziehungen überhaupt sichtbar macht, ohne dass die Nutzerin ständig jede Person einzeln inspizieren muss. |
| **Ortsentwicklung** (Gebäudezustand, Bevölkerungsverteilung) | Sekundär — plausibler, stimmungsgebender Hintergrund ("Warum zieht es alle ins Field?"), aber ohne eigenständige Spannungskurve. |
| **Wirtschaftliche Dynamik** (Produktion/Handel) | Sekundär, Kontext für Überleben/Wohlstand — nicht die eigentliche Erzählung, eher die Erklärung, *warum* eine Lebensgeschichte so verläuft, wie sie verläuft. |
| **Wetter/Jahreszeit** | Tertiär — Stimmung und gelegentlich erklärender Kontext (Ernteeinbruch im Winter), kein eigener Fokus. |

**Konsequenz für die Informationsarchitektur (26.6):** Personen- und Beziehungsdaten bekommen die reichhaltigste Detailansicht; Orte/Wirtschaft/Wetter sind Kontext-Information auf der Weltebene, nicht eigene Hauptansichten.

---

## 26.5 Kern-User-Journey

Konkretisierung der Beispiel-Journey aus dem Auftrag, begründet aus 26.3–26.4:

```
App öffnen
   ↓
Neue Welt erzeugen ODER Save laden        (Simulation Command: create/load)
   ↓
Weltübersicht: Tick/Jahreszeit/Wetter,     (Observation Query: getWorldSnapshot)
Orts-Graph mit Bevölkerungsverteilung,
Ereignis-Feed (letzte N Events), Play-Button
   ↓
Nutzerin drückt Play (Default-Geschwindigkeit, moderat)   (Simulation Command: start)
   ↓
Ticks laufen; Ereignis-Feed füllt sich live;
Bevölkerungszahlen an Orten verändern sich sichtbar
   ↓
Ein Ereignis fällt auf ("Geburt: #47", "Handel: #12 kauft Food")
   ↓
Nutzerin klickt auf die im Event genannte Person   (reine Presentation-Navigation, keine Simulation-Wirkung)
   ↓
Personendetail öffnet sich (weiterhin live, Simulation läuft im Hintergrund weiter)
   ↓
Nutzerin sieht: Alter/Lebensphase, aktuellen Ort/Aktivität, Bedürfnisse,
Partner, Freunde, Eltern, Kinder — mit Links zu jedem davon
   ↓
Nutzerin pausiert kurz, um in Ruhe zu lesen         (Simulation Command: pause)
   ↓
Nutzerin klickt auf einen der Freunde → dessen Detailansicht    (Navigation)
   ↓
Nutzerin drückt Resume, ggf. mit höherer Geschwindigkeit,
um schneller zu sehen, "wie es weitergeht"          (Simulation Command: resume/setSpeed)
   ↓
Nutzerin wechselt zurück zur Weltübersicht, lässt die Zeit weiterlaufen,
kehrt später zur selben Person zurück, um zu sehen, was sich verändert hat
   ↓
Nutzerin speichert einen interessanten Moment (Save) und beendet die Sitzung
```

Diese Journey ist bereits **heute vollständig mit den bestehenden Interaktionen abbildbar** (Start/Pause/Resume/Speed, Observation Queries, Save) — sie fordert keine neue Simulationslogik, nur eine neue Darstellung derselben Daten und eine Navigations-/Auswahlebene in der Presentation.

---

## 26.6 Informationshierarchie

### Ebene A — Welt (immer sichtbar, Default-Ansicht)

**Sofort sichtbar:** Tick, Jahreszeit, Wetter, Play/Pause/Step/Speed-Kontrollen, Orts-Graph mit Personen-/Tieranzahl pro Ort, aggregierte Gesamtpopulation (Personen/Tiere), die letzten N Ereignisse (Feed).

**Bewusst NICHT dauerhaft sichtbar auf dieser Ebene:** einzelne Personendaten (Bedürfniswerte, Aktivitäten aller ~20+ Personen gleichzeitig aufzulisten wäre die in §18 beschriebene Informationsüberlastung), RNG-/technische Interna, die volle Event-History (nur ein begrenztes, aktuelles Fenster).

### Ebene B — Ort (nach Auswahl eines Orts)

**Sofort sichtbar nach Auswahl:** Name, Personen-/Tieranzahl, Gebäude (Art + Zustand, sofern vorhanden).

**Erst nach weiterer Auswahl:** die Liste der dort befindlichen Personen/Tiere selbst (als klickbare Kurzeinträge, nicht mit vollen Detaildaten) — sonst würde die Ortsansicht bei belebten Orten wieder zur Datenwand.

### Ebene C — Entity (nach Auswahl einer Person/eines Tiers)

**Sofort sichtbar:** Identität/Name, Alter + Lebensphase, aktueller Ort, aktuelle Aktivität, Bedürfnisse (Person: Hunger/Energie/Sozial; Tier: Hunger/Energie), bei Personen zusätzlich Partner/Freunde/Eltern/Kinder — jeweils als Namen mit Klick-Navigation zur jeweiligen Detailansicht.

**Bewusst nicht dauerhaft angezeigt:** exakte interne Tick-Zahlen für "seit wann in dieser Aktivität" als Rohwert (besser: relativ/verständlich formuliert), Inventory-Rohmengen (Ressourcenbestand ist wirtschaftlicher Kontext, nicht Teil der persönlichen Geschichte — höchstens als sekundäre, ausklappbare Information).

**Was gehört in eine eigene Detailansicht statt in die Übersicht:** die vollständige Beziehungsliste (Freunde können mehrere sein) und die volle Aktivitätsbeschreibung — beides passt nicht kompakt in eine Listenzeile der Ortsansicht.

---

## 26.7 Zeit- und Interaktionsmodell

### Zeitmodell

**Simulation Time** (`ControllerStatus.currentTick`, deterministisch, unabhängig von Echtzeit) vs. **Wall Clock Time** (`ticksPerSecond`/`TickScheduler`-Kadenz, rein subjektiv/Beobachtungstempo) sind strikt zu trennen — das ist keine neue Entscheidung, sondern die in Subtask 20/21 bereits verbindlich etablierte und empirisch verifizierte Regel. Für die UX bedeutet das konkret:

- Die einzige verbindliche Zeitanzeige ist der rohe **Tick-Zähler** plus **Season**/**Weather** (beide bereits in `WorldSnapshot`) — das erfüllt "Tick-Anzeige, Jahreszeit, Wetter" vollständig ohne jede neue Logik.
- Eine abgeleitete Kalenderanzeige ("Tag 14 von Frühling, Jahr 2") wäre reine Arithmetik über `tick`, `ticksPerDay`, `daysPerSeason` — fachlich unproblematisch (reine Ableitung, kein neuer Zustand), aber **aktuell nicht ohne kleine Erweiterung umsetzbar**, weil die Presentation nach einem `load()` keinen Zugriff auf die aufgelöste `SimulationConfig` hat (`SimulationController` exponiert `getConfig()` nicht). Siehe 26.15/26.19 — für den MVP wird bewusst auf die reine Tick-Zahl zurückgegriffen, um keine Erweiterung zu erzwingen.
- Geschwindigkeit (`setSpeed`) ändert nachweislich nur die Kadenz, nie den Inhalt — UX-Konsequenz: die Anwendung muss klar kommunizieren, dass ein höheres Tempo nur *das Beobachten* beschleunigt, nicht die Simulation "anders" macht. Die einzige echte Konsequenz hoher Geschwindigkeit ist, dass der live mitlaufende Event-Feed für einen Menschen weniger gut mitlesbar wird — das wird dadurch aufgefangen, dass Ereignis-Geschichte jederzeit pausiert und zurückgeblättert werden kann (sie ist persistent in `events.history`, nicht ephemer).

### Interaktionsmodell

| Interaktion | Zweck | Auslöser | Ergebnis | Benötigte Daten | Schicht | Typ |
|---|---|---|---|---|---|---|
| Start | Simulation beginnt zu laufen | Play-Button | `state='running'`, Scheduler feuert | — | `SimulationController` | **Simulation Command** |
| Pause | Fortschritt anhalten | Pause-Button | `state='paused'`, Tick friert ein | — | `SimulationController` | **Simulation Command** |
| Resume | Fortsetzen | Play-Button (aus Pause) | `state='running'` | — | `SimulationController` | **Simulation Command** |
| Step(n) | Exakt n Ticks, unabhängig vom Scheduler | Step-Button | Tick +n, synchron | n | `SimulationController` | **Simulation Command** |
| SetSpeed | Kadenz ändern | Speed-Regler | `ticksPerSecond` geändert | Hz-Wert | `SimulationController` | **Simulation Command** |
| Ort auswählen | Fokus wechseln | Klick auf Orts-Knoten | Detailpanel zeigt Ort | `locationId` | **nur Presentation** | **Presentation State** |
| Entity auswählen | Fokus wechseln | Klick auf Person/Tier | Detailpanel zeigt Entity | `entityId` | **nur Presentation** | **Presentation State** |
| Ort inspizieren | Ortsdaten laden | Folge von "Ort auswählen" | Ortsdetail-Daten | `locationId` | `WorldObserver.getLocationObservation` | **Observation Query** |
| Entity inspizieren | Personendaten laden | Folge von "Entity auswählen" | Personendetail-Daten | `entityId` | `WorldObserver.getPersonObservation`/`getAnimalObservation` | **Observation Query** |
| Ereignisse ansehen | Chronologie laden | Feed-Scroll / "mehr laden" | Event-Liste | `{last, type?}` | `WorldObserver.getRecentEvents` | **Observation Query** |
| Save | Zustand sichern | Save-Button | Datei geschrieben | Pfad | `SimulationController.save` | **Simulation Command** (persistenzseitig) |
| Load | Zustand laden | Load-Button/Dateiauswahl | Engine ersetzt | Pfad | `SimulationController.load` | **Simulation Command** |

**Zentrale Regel (bereits in der eingefrorenen Architektur verbindlich, hier nur produktseitig bestätigt):** Auswahl/Navigation (welcher Ort, welche Person, welcher Tab gerade offen ist) ist **niemals** Simulationszustand. Sie lebt ausschließlich in der Presentation-Schicht (im Web-Client z. B. im Browser-Zustand/der URL), wird nie an `SimulationController` geschickt und nie in `WorldState`/`SaveFile` gespeichert. Sie steuert lediglich, *welche* Observation Query im nächsten Moment gestellt wird.

### Beobachtung statt Kontrolle — Bewertung der Grenze

Die bestehende Grenze (siehe Auftrag §10) ist für dieses Produkt **richtig und wird bestätigt, nicht aufgeweicht**:

- Sie ist konsistent mit der in 26.4 begründeten Rolle (Beobachterin/Entdeckerin) — direkte Kontrolle würde die Anwendung strukturell in ein anderes Produkt (Lebenssimulationsspiel) verwandeln.
- Sie ist konsistent mit dem zentralen Reiz (26.5: emergente, *ungesteuerte* Lebensläufe) — jede direkte Einflussnahme würde die Emergenz künstlich, weil vorhersagbar/manipulierbar, entwerten.
- Jede der im Auftrag genannten "nicht vorgesehenen" Fähigkeiten (Person bewegen, Bedürfnisse ändern, Beziehung erzwingen, Beruf setzen, Partner wählen, Freundschaft erzeugen, Wetter ändern, Ressourcen manuell ändern) würde neue Domänenlogik erfordern — außerhalb des Auftragsrahmens.

**Dokumentiert als mögliche, spätere Produktidee (nicht jetzt, nicht Teil dieses Konzepts):** ein rein *präsentationsseitiges* "Favorit/Merken"-Feature für einzelne Personen (kein Domänen-Zustand, nur lokale UI-Markierung, um bestimmte Lebensläufe leichter wiederzufinden) wäre jederzeit ohne Domänenänderung möglich, wird aber bewusst nicht in den MVP aufgenommen (siehe 26.13/26.19).

---

## 26.8 UI-/Technologievergleich

| Kriterium | CLI/TUI (bestehend) | Web-App (lokal) | Desktop (Electron/Tauri) |
|---|---|---|---|
| Technische Passung zum Stack | Bereits vorhanden, 0 neue Dependencies | Node/TS direkt weiterverwendbar; Browser braucht einen minimalen Build-Schritt für TS | Würde dieselbe Web-UI + einen ganzen Runtime-Wrapper (Electron: Chromium+Node gebündelt; Tauri: neue Rust-Toolchain) erfordern |
| Vorhandener Stack genutzt? | Ja, vollständig | Ja — `SimulationController`/`WorldObserver` werden nur um eine dünne HTTP/SSE-Schicht ergänzt | Ja, aber zusätzlich zur Web-UI eine komplette weitere Laufzeitumgebung |
| Entwicklungsaufwand | Minimal (bereits fertig) | Mittel — ein neuer, aber kleiner Server + Client | Hoch — Web-App plus Packaging/Update-Mechanismus/Runtime-Overhead |
| Interaktivität (Klicken, Auswählen, Live-Updates) | Stark limitiert (Zeilen-basiertes Menü, sequenzielle `rl.question()`-Eingaben — in Subtask 21 zudem eine reale Race-Condition bei Burst-Eingaben dokumentiert) | Nativ gut (Klick, Hover, parallele Panels, Live-Push) | Identisch zur Web-App (nutzt dieselbe UI) |
| Visualisierungsmöglichkeiten (Orts-Graph, Zeitleisten, Beziehungsnetz) | Praktisch keine über Text hinaus | Gut (SVG/Canvas für Graph, echte Listen/Karten/Zeitleisten) | Identisch zur Web-App |
| Langfristige Erweiterbarkeit | Begrenzt (Text bleibt Text) | Gut — derselbe Client kann später eingebettet/paketiert werden | Gut, aber Mehraufwand wird erst später fällig, wenn "installierbare App" tatsächlich gebraucht wird |
| Lokale Offline-Nutzung | Ja | Ja (lokaler Server, `localhost`, kein Internet nötig) | Ja |
| Komplexität/Abhängigkeiten | Keine zusätzlichen | Minimal, wenn bewusst klein gehalten (siehe 26.9) | Deutlich höher (Electron-Bundle-Größe/Update-Mechanismus, oder Tauri = neue Rust-Toolchain) |
| Wiederverwendung Application-/Observation-Schicht | 1:1, bereits bewiesen | 1:1 — identischer `SimulationController`/`WorldObserver`, nur ein neuer Presentation-Konsument | 1:1, identisch zur Web-App |

**Bewertung:** Die CLI bleibt für ihren bewiesenen Zweck (technischer Nachweis, Skripting, Automatisierung, Determinismus-Tests) vollständig erhalten — sie wird **nicht ersetzt**, sondern um einen zweiten, produktorientierten Presentation-Einstiegspunkt ergänzt. Für das in 26.3–26.6 beschriebene Produkterlebnis (visuelle Orts-/Beziehungs-/Zeitdarstellung, Live-Beobachtung, Explorations-Navigation) ist Text strukturell unzureichend. Ein Desktop-Wrapper (Electron/Tauri) löst kein zusätzliches Problem, das eine lokale Web-App nicht bereits löst, und wäre reine, unbegründete Mehrkomplexität zum jetzigen Zeitpunkt — explizit zurückgestellt, nicht abgelehnt (siehe 26.19).

### 26.9 Technologieentscheidung

> **Empfohlene Technologie: eine lokale Web-Anwendung — dünner Node-HTTP-Server als neuer Presentation-Einstiegspunkt neben der bestehenden CLI, mit einem eigenständigen Browser-Client.**

Begründung, abgeleitet aus diesem konkreten Repository (nicht aus allgemeiner Popularität):

- **Backend:** `node:http` (Standardbibliothek) reicht für die in 26.7 gelistete kleine, feste Anzahl an Routen (Snapshot/Person/Location/Events abrufen; Start/Pause/Resume/Step/SetSpeed/Save/Load auslösen) — genau dieselbe Argumentationslinie, mit der `docs/02-architektur.md` bereits `node:util.parseArgs` statt einer CLI-Parsing-Bibliothek gewählt hat ("reicht aus"). Ein Express/Fastify wäre für ~10 Routen unbegründete Zusatzabhängigkeit.
- **Live-Updates:** Server-Sent Events (`EventSource`, nativ im Browser, **keine** neue Dependency) für den einseitigen Push "Tick fortgeschritten/Snapshot geändert". WebSockets wären hier Overkill — alle Commands (Start/Pause/…) sind klassische Request/Response-Aktionen, kein bidirektionaler Kanal nötig.
- **Frontend:** Für den in 26.13 definierten MVP-Umfang (vier Ansichten: Welt, Ort, Person/Tier, Events) reicht Vanilla-TypeScript ohne UI-Framework — konsistent mit der im Repository bereits gelebten Haltung "keine Abhängigkeit ohne klaren, aktuellen Bedarf" (z. B. hand-geschriebener RNG statt Bibliothek, `SupplyDemandMarket` erst bei tatsächlichem Bedarf ergänzt). Einzige neue **Dev**-Dependency: ein minimaler Build-Schritt, der TypeScript für den Browser bündelt (z. B. Vite) — das ist unvermeidbar, da Browser kein `.ts` ausführen, aber bewusst klein gehalten (kein Framework, nur Bundler/Dev-Server).
- **Warum nicht React/Vue/Svelte jetzt:** keines davon ist durch den tatsächlichen MVP-Umfang begründet (vier Ansichten, überschaubarer State). Sollte der State/View-Umfang nach dem MVP deutlich wachsen, ist eine kleine, gezielt nachgezogene Reaktivitätsbibliothek eine spätere, dann begründete Entscheidung — nicht Teil dieses Konzepts (siehe 26.19).
- **Warum nicht Electron/Tauri jetzt:** siehe 26.8 — löst kein Problem, das die Web-App nicht bereits löst; Mehraufwand ohne aktuellen Nutzen.

---

## 26.10 Visuelles Konzept

Eigenes Layout, abgeleitet aus dem tatsächlichen Domänenmodell (Welt → Ort → Entity, Event-Feed als Querschnitt):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Living World          Frühling · Tick 1248        ▶  ❚❚  ▮  Speed: 2×   │
├───────────────────────────────┬──────────────────────────────────────────┤
│                                │  Ereignisse                    ▲ live   │
│      Village ●5P·3T           │  [1248] Handel: #12 kauft Food  ↦ #12   │
│      ╱   |    ╲                │  [1247] Geburt: #47 (Eltern: #12,#19)↦ │
│  Field  Forest  Market         │  [1245] Wetter → Rain                  │
│  ●8P·3T ●3P·2T  ●4P·2T         │  [1240] Ernte: Field +34 Food           │
│                                │  ...                                    │
│  (Knoten = Orte, Kanten =      ├──────────────────────────────────────────┤
│   Verbindungen; Klick öffnet   │  Ausgewählt: Person #12 "Mira"          │
│   Ortsdetail rechts unten)     │  Erwachsene · Ort: Village              │
│                                │  Aktivität: Handel (seit 2 Ticks)       │
│                                │  Bedürfnisse: 🍖72  ⚡65  ❤58            │
│                                │  Partner: #19  Freunde: #3, #8, #21     │
│                                │  Eltern: —  Kinder: #47                 │
├───────────────────────────────┴──────────────────────────────────────────┤
│ Personen: 20 · Tiere: 10 · Orte: 4                          [Save][Load]│
└──────────────────────────────────────────────────────────────────────────┘
```

Prinzip: **links = Orientierung (wo befindet sich die Welt gerade räumlich/zeitlich)**, **rechts = Vertiefung (was ist bemerkenswert, was habe ich ausgewählt)**. Jede Person/jeder Ort im Event-Feed und im Detailpanel ist klickbar (↦) und führt direkt zur jeweiligen Detailansicht — das ist die technische Umsetzung des Journey-Schritts "Nutzerin öffnet Detailansicht" aus 26.5.

### Welt-/Ortsdarstellung — Karte vs. schematischer Graph

Geprüft gemäß Auftrag §14: Das Domänenmodell besitzt **keine** Geokoordinaten, kein Gelände, keine Ausdehnung — nur benannte Orte mit gerichteten Verbindungen und Reisezeiten (`Location.connections`, `travelTicks`). Eine geografische Karte würde Struktur erfinden, die nicht existiert — ausdrücklich nicht zulässig.

**Entscheidung: schematischer Knoten-Graph**, exakt das im Modell vorhandene abbildend: Knoten = Orte (mit Live-Badge für Personen-/Tieranzahl), Kanten = `connections` (optional mit `travelTicks` beschriftet). **Semantische Funktion:** nicht Navigation/Pathfinding (das übernimmt intern bereits `PathTable`, für die Nutzerin unsichtbar) — sondern **Orientierung und Bevölkerungsverteilung auf einen Blick**, sowie Einstiegspunkt in die Ortsdetailansicht per Klick. Bei der aktuellen Größe (4 Orte, laut `docs/02-architektur.md` bis ~10–30 Orte skalierend) bleibt ein einfacher, statisch layoutbarer Graph (kein Force-Layout/Physik nötig) völlig ausreichend.

### 26.11 Welt-/Orts-/Personen-/Ereignisansichten

**Personenansicht** — abgeleitet exakt aus `PersonObservation`:

```
Person
├── Identität (Name, ggf. Rolle: Farmer/Lumberjack)
├── Alter / Lebensphase (Kind/Erwachsene)
├── aktueller Ort               → klickbar zur Ortsansicht
├── aktuelle Aktivität (Idle / Unterwegs nach X / verrichtet Y seit N Ticks)
├── Bedürfnisse (Hunger, Energie, Sozial)
├── Partnerschaft               → klickbar zur Partnerin/zum Partner
├── Freunde (Liste)              → jeweils klickbar
├── Eltern (Liste)               → jeweils klickbar
└── Kinder (Liste)               → jeweils klickbar
```

Welche Informationen erzeugen tatsächlich eine Geschichte? **Alter/Lebensphase im Zeitverlauf, Partnerschaft, Kinder, Freundeskreis** — das sind die Felder, die beim wiederholten Besuch derselben Person tatsächlich eine Entwicklung zeigen. Bedürfnisse/Aktivität sind der "Momentaufnahme"-Teil (interessant für "was macht sie *jetzt*"), aber ohne Zeitverlauf keine Geschichte für sich. Tieransicht ist eine reduzierte Variante derselben Darstellung (ohne Partner/Freunde/Sozialbedürfnis, gemäß `AnimalObservation`) — mit vernachlässigbarem Zusatzaufwand, da dieselbe Detail-Komponente wiederverwendet wird.

**Ereignisansicht:**

- Ein Event-Feed **ist wichtig** — er ist laut 26.5 das zentrale Werkzeug, damit die Nutzerin nicht jede Person einzeln durchklicken muss, um etwas Neues zu entdecken.
- Prominent sollten `BirthEvent`, `DeathEvent` erscheinen (unmittelbar personenbezogen, hohe Erzählkraft) sowie `SeasonChangedEvent`/`WeatherChangedEvent` als seltene, stimmungsgebende Marker. `TradeEvent`/`HarvestEvent`/`MovementEvent` sind hochfrequent und wirtschaftlich/routinehaft — im MVP mitgeführt, aber nicht optisch hervorgehoben (kein Fett/Highlight), sonst dominieren sie den Feed rein durch Menge. `BuildingConditionChangedEvent` ist selten und ortsbezogen (Verbindung zur Ortsansicht).
- Navigation Event → Person/Ort: jedes Event trägt bereits die relevante(n) ID(s) (`entityId`, `buildingId`, …) — ein Klick öffnet direkt die zugehörige Detailansicht. Keine neue Datenstruktur nötig, nur eine Presentation-seitige Verlinkung.
- Chronologie: neueste zuerst (wie bereits in `formatWorldOverview`/CLI etabliert), mit Tick-Nummer je Eintrag.
- Sichtbare Menge: ein begrenztes Fenster (z. B. 20–30 sichtbare Einträge, "mehr laden" bei Bedarf über `getRecentEvents({last: N})`) — **nicht** die volle History auf einmal, siehe 26.12/26.15 (technischer Hinweis zu `getRecentEvents()` ohne Parameter).
- Keine neuen Event-Typen — die sieben vorhandenen sind vollständig abzudecken, nicht zu erweitern.

### 26.12 Entdeckungsmechanismen ("Living World"-Gefühl) und Informationsüberlastung

**Wichtiger, code-verifizierter Befund:** Weder Freundschaftsbildung (`SocialBondingSystem`) noch Partnerschaftsbildung (`PopulationSystem`) emittieren ein `SimEvent`. Der Event-Feed zeigt also **niemals** "Freundschaft entstanden" oder "Partnerschaft begonnen" — das lässt sich am vorhandenen Domänenmodell nicht ändern, ohne einen neuen Event-Typ einzuführen (ausdrücklich nicht erlaubt).

Zwei Entdeckungsebenen, beide **ohne neue Domänen-/Event-Architektur**, rein aus vorhandenen Daten:

1. **Event-Feed** (26.11) — deckt Geburt, Tod, Handel, Ernte, Bewegung, Jahreszeit-/Wetterwechsel, Gebäudezustand ab. Bereits vollständig aus `getRecentEvents()` ableitbar.
2. **Snapshot-Vergleich in der Presentation** (neu für dieses Konzept, aber **rein präsentationsseitig**): Da `WorldObserver` bei jedem Aufruf echte, unabhängige Kopien liefert, kann die Presentation zwei aufeinanderfolgende `PersonObservation`s (z. B. beim periodischen Live-Update) miteinander vergleichen und Änderungen an `partnerId`/`friendIds`/`lifeStage` **client-seitig** erkennen ("Mira und Jonas sind jetzt Partner", "Kim ist jetzt erwachsen") — ohne einen einzigen neuen Domänen-Zustand oder Event-Typ, ausschließlich Differenzbildung über bereits existierende Observation-Daten. Das ist die einzige Möglichkeit, Beziehungsentwicklungen ohne Domänenänderung sichtbar zu machen, und wird als **Post-MVP-Erweiterung** dokumentiert (siehe 26.13/26.19) — für den MVP reicht das direkte Öffnen einer Person, um ihren *aktuellen* Beziehungsstatus zu sehen.

**Informationsüberlastung — konkrete Regeln für dieses Konzept:**

- Auf Weltebene wird **aggregiert** (Personen-/Tieranzahl pro Ort, Gesamtpopulation), nie die volle Personenliste gleichzeitig mit vollen Detaildaten gezeigt.
- Detaildaten (Bedürfnisse, Aktivität, volle Beziehungsliste) erscheinen **ausschließlich nach Auswahl**, nie dauerhaft für mehr als eine Entity gleichzeitig.
- Der Event-Feed aktualisiert sich live, aber **das Detailpanel einer ausgewählten Person nicht unkontrolliert** in einer Frequenz, die Lesen unmöglich macht — ein sanftes Update-Intervall (z. B. bei jedem Tick, aber ohne Layout-Sprung) ist ausreichend; harte Echtzeit-Diffing-Animationen sind nicht Teil des MVP.
- "Hineinzoomen" ist die durchgängige Navigationsfigur: Welt → Ort → Entity → (Beziehung →) andere Entity — nie ein Sprung, der die vorherige Ebene verdeckt oder verliert (Zurück-Navigation bleibt erhalten).

---

## 26.13 MVP

**Im MVP enthalten** (jeder Punkt unten ist bereits heute vollständig mit bestehenden `SimulationController`/`WorldObserver`-Methoden umsetzbar):

1. Weltübersicht: Tick, Season, Weather, Play/Pause/Step/Speed-Kontrollen, Orts-Graph mit Live-Bevölkerungsbadges, Gesamtpopulation.
2. Simulation laufen lassen, pausieren, Step, Geschwindigkeit ändern.
3. Ort auswählen → Ortsdetail (Name, Personen-/Tieranzahl, Gebäude mit Art/Zustand, Liste der dort befindlichen Personen/Tiere als klickbare Kurzeinträge).
4. Person auswählen → Personendetail (26.11).
5. Tier auswählen → Tierdetail (reduzierte Variante derselben Detail-Komponente — geringer Zusatzaufwand, da Daten bereits vorhanden).
6. Ereignis-Feed mit Navigation zu Person/Ort (26.11), begrenztes, nachladbares Fenster.
7. Save/Load über die UI (identische Semantik zur CLI, gleicher `RawStorage`-Port).

**Explizit NICHT Bestandteil des MVP** (bewusst später, kein Vergessen):

- Präsentationsseitiges Snapshot-Diffing für "Beziehung entstanden/verändert" (26.12) — MVP zeigt nur den *aktuellen* Stand bei Auswahl.
- Filtern/Sortieren/Suchen in großen Personenlisten (relevant erst bei deutlich größerer Population als aktuell Standard).
- Jede Form von Konfigurations-UI (Seed, Startpopulation, Wirtschaftsparameter) — Start weiterhin ausschließlich über bestehende CLI-Flags/Config-Datei, die Web-UI startet/lädt nur, was ihr über denselben Mechanismus übergeben wird.
- "Favorit/Merken"-Feature für Personen (26.7) — denkbar, aber nicht MVP-kritisch.
- Electron-/Desktop-Packaging (26.8/26.9).
- Abgeleitete Kalenderanzeige/Seed-Anzeige nach Load (26.15) — würde eine kleine, zusätzliche Application-Erweiterung (`getConfig()`-Getter) voraussetzen, die für den MVP nicht notwendig ist.
- Irgendeine Form von WebSocket-basierter bidirektionaler Kommunikation — SSE reicht für den definierten Umfang vollständig aus.

---

## 26.14 Explizite Nicht-Ziele (Wiederholung/Bestätigung aus dem Auftrag, produktseitig bestätigt)

Keine der folgenden Fähigkeiten wird angestrebt, weder im MVP noch als nahe Erweiterung, weil sie die in 26.4 begründete Rolle der Nutzerin (Beobachterin, nicht Lenkerin) und den in 26.5 begründeten Reiz (ungesteuerte Emergenz) unterlaufen würde: direkte Bewegungssteuerung einer Person, manuelles Setzen von Bedürfnissen, erzwungene Beziehungen/Partnerschaften/Freundschaften, manuelle Rollen-/Berufszuweisung, manuelle Wetter-/Ressourcenänderung, jede Form von Spielziel oder Punktesystem.

---

## 26.15 Technische Machbarkeit

Presentation → SimulationController → WorldObserver → SimulationEngine/WorldState, geprüft für jede MVP-Kernfunktion:

| Kernfunktion | Machbarkeit |
|---|---|
| Weltübersicht (Tick/Season/Weather/Population/Orte) | **bereits vollständig möglich** — 1:1 aus `getWorldSnapshot()` |
| Play/Pause/Resume/Step/SetSpeed | **bereits vollständig möglich** — 1:1 aus `SimulationController` |
| Orts-Graph (Knoten/Kanten) | **mit vorhandenen Daten möglich** — `environment.locations`-Struktur ist über keinen aktuellen `WorldObserver`-Getter direkt als Graph exponiert, aber `LocationObservation` plus die (bereits in der Config bekannten, weil sie die Presentation selbst beim Start lädt) `connections` reichen; im schlimmsten Fall **benötigt eine minimale Observation-Erweiterung** (ein `getLocationGraph()`-artiger Getter, der `connections` mit ausgibt) — kein neuer Domänenzustand, nur eine zusätzliche Lesefunktion. |
| Ortsdetail, Personendetail, Tierdetail | **bereits vollständig möglich** — 1:1 aus `getLocationObservation`/`getPersonObservation`/`getAnimalObservation` |
| Event-Feed mit Navigation | **bereits vollständig möglich** — `getRecentEvents({last, type})`; alle Events tragen bereits die nötigen IDs für Navigation |
| Save/Load über UI | **bereits vollständig möglich** — 1:1 aus `SimulationController.save/load` + `RawStorage`-Port |
| Snapshot-Diffing für Beziehungsänderungen (Post-MVP) | **mit vorhandenen Daten möglich, benötigt kleine Presentation-Erweiterung** — reine Vergleichslogik über zwei Observation-Aufrufe, kein Domänen-/Application-Eingriff |
| Abgeleitete Kalenderanzeige / Seed-Anzeige nach Load (Post-MVP/offen) | **benötigt kleine Application-Erweiterung** — ein schlichter `SimulationController.getConfig(): SimulationConfig`-Getter (reines Durchreichen, keine neue Logik) |
| Direkte Personensteuerung, erzwungene Beziehungen etc. | **benötigt tatsächlich neue Domänenlogik** — nicht Teil dieses Konzepts, nicht empfohlen (26.14) |

**Grundsatz eingehalten:** Für den gesamten definierten MVP ist **keine** neue Domänenlogik nötig; höchstens eine einzige, optionale, rein durchreichende Observation-Ergänzung (Location-Graph-Getter) käme in Betracht, und selbst die lässt sich im MVP auch ohne neuen Getter lösen, indem die Presentation die beim Start ohnehin geladene Config-Struktur (`worldGraph.locations`) direkt mitführt.

---

## 26.16 Architekturverträglichkeit

Das Konzept respektiert vollständig die eingefrorene Architektur (Subtask 19–21):

- `domain/`, `world/`, `simulation/` bleiben unverändert — keine hier beschriebene MVP-Funktion braucht einen Eingriff.
- V1/V2/A1, RNG-Substreams, Tick-Reihenfolge, Persistenzschema (Version 3) bleiben unverändert.
- Observation bleibt read-only — der neue Web-Client ruft ausschließlich `WorldObserver`-Methoden auf, nie `EntityInspector` (mutable) und nie den rohen `WorldState`.
- Presentation (der neue lokale Server *und* der Browser-Client) mutiert `WorldState` zu keinem Zeitpunkt direkt — jede Zustandsänderung läuft ausschließlich über `SimulationController`.
- UI-Zustand (Auswahl von Ort/Person, aktiver Tab) bleibt strikt Presentation-Zustand (Browser), nie Teil von `WorldState`/`SaveFile` (26.7).
- Simulation Time bleibt von Wall Clock Time getrennt (26.7) — der neue Server fügt keine eigene Zeitsemantik hinzu, er liest nur `ControllerStatus`/`WorldSnapshot`.
- Commands werden weiterhin nur an Tick-Grenzen wirksam (unverändertes Verhalten von `SimulationController`/`SimulationEngine`).
- Keine neuen Eventtypen nur für die UI — Entdeckung von Beziehungsänderungen läuft über Snapshot-Diffing in der Presentation (26.12), nicht über neue `SimEvent`-Varianten.
- Die bestehende CLI (`presentation/cli.ts`, `presentation/interactive.ts`) bleibt vollständig erhalten und unverändert — der neue Web-Modus ist ein zusätzlicher, gleichrangiger Presentation-Einstiegspunkt, kein Ersatz.

---

## 26.17 Entscheidungsmatrix

| Entscheidung | Optionen | Empfehlung | Begründung |
|---|---|---|---|
| UI-Technologie | CLI/TUI, Web, Desktop | **Web (lokal)** | Einzige Option mit ausreichender Visualisierung/Interaktivität bei minimalem Zusatzaufwand und voller Wiederverwendung der bestehenden Schicht (26.8/26.9) |
| Hauptperspektive | Welt/Ort/Person/Event/Mix | **Mix: Welt+Event als Dauer-Kontext, Person als Vertiefungsziel** | Zentraler Reiz sind Personen/Beziehungen (26.5); Welt/Events sind das Entdeckungswerkzeug dahin |
| Zeitsteuerung | Play/Pause/Step/Speed | **Alle vier, wie bestehend** | Bereits vollständig vorhanden und in Subtask 21 als korrekt/speed-unabhängig verifiziert |
| Navigation | Fest verdrahtete Tabs vs. Hineinzoomen (Welt→Ort→Entity→Beziehung) | **Hineinzoomen** | Passt zur Rolle "Entdeckerin" (26.4), vermeidet Informationsüberlastung (26.12) |
| Weltansicht | Geografische Karte vs. schematischer Graph | **Schematischer Knoten-Graph** | Domänenmodell hat keine Geodaten — eine echte Karte würde Struktur erfinden (26.10) |
| Personenansicht | Minimal (nur Kerndaten) vs. voll (inkl. aller Beziehungen, klickbar) | **Voll, mit Klick-Navigation** | Beziehungen sind der Kern des Reizes (26.5/26.11) |
| Ereignisansicht | Kein Feed vs. ungefilterter Feed vs. begrenzter, navigierbarer Feed | **Begrenzter, navigierbarer Feed, alle 7 Typen, ohne visuelle Überbetonung der häufigen Typen** | Entdeckungswerkzeug (26.12), aber ohne Überlastung |
| Interaktion | Beobachten vs. Steuern | **Ausschließlich Beobachten** (+ Zeitsteuerung + Navigation) | Aus Domänenmodell begründet, siehe 26.4/26.7 |
| MVP-Umfang | Groß (alles inkl. Diffing/Filter) vs. klein (Kern-Beobachtungsfunktionen) | **Klein, wie in 26.13 definiert** | Muss "tatsächlich implementiert und getestet werden können" (Auftrag §20) |

---

## 26.18 Vorgaben für Subtask 23

**Was soll gebaut werden:** der in 26.13 definierte MVP — ein lokaler, additiver Web-Presentation-Modus (Server + Browser-Client), der ausschließlich über `SimulationController`/`WorldObserver` mit der eingefrorenen Simulation spricht.

**Dateien, die verändert werden dürfen:**
- Neue Dateien unter einem neuen Presentation-Unterpfad, z. B. `src/presentation/web/` (Server: Routing, SSE-Endpoint, statisches Ausliefern des Clients) und einem neuen Client-Verzeichnis (z. B. `src/presentation/web-client/` oder analog, je nach gewählter Build-Struktur).
- Neue Testdateien unter `tests/presentation/` (analog zu `interactiveFormat.test.ts`).
- `package.json`: **ausschließlich** um die in 26.9 genannte(n) neue(n) Dev-Dependency/-Dependencies (Bundler/Dev-Server, z. B. Vite) erweiterbar — keine weiteren Runtime-Dependencies ohne erneute Rücksprache.
- `tsconfig.json`/`tsconfig.build.json`: nur soweit nötig, um das neue Client-Verzeichnis in den Build/Typecheck einzubeziehen — keine Änderung bestehender Compiler-Optionen ohne Grund.

**Dateien, die NICHT verändert werden dürfen:** alles unter `src/domain/`, `src/world/`, `src/simulation/`, `src/persistence/`, `src/config/`, `src/random/`; `src/application/SimulationEngine.ts`, `SimulationController.ts`, `TickScheduler.ts`, `buildWorldFromConfig.ts`, `loadConfig.ts`; `src/observability/WorldObserver.ts` und alle übrigen bestehenden `observability/`-Dateien; `src/presentation/cli.ts`, `interactive.ts`, `interactiveFormat.ts` (bestehender CLI-Modus bleibt vollständig unangetastet).

**Falls sich während der Implementierung zeigt, dass eine der in 26.15 genannten kleinen Erweiterungen (Location-Graph-Getter, `getConfig()`-Getter) tatsächlich nötig wird:** das ist ausdrücklich erlaubt, aber **nur als schlichte, reine Durchreichfunktion ohne neue Logik**, in `SimulationController`/`WorldObserver` selbst (nicht in `SimulationEngine`, `world/`, `simulation/`), und muss im PR/Bericht einzeln benannt werden.

**Erlaubte neue Dependencies:** genau die in 26.9 benannte(n) minimale(n) Dev-Dependency/-Dependencies für den Frontend-Build (Empfehlung: Vite). Ausdrücklich **nicht** ohne erneute Rücksprache: Express/Fastify (siehe 26.9 — `node:http` reicht), React/Vue/Svelte (siehe 26.9 — MVP-Umfang rechtfertigt kein Framework), Electron/Tauri (siehe 26.8/26.9), `ws`/WebSocket-Bibliotheken (SSE reicht).

**Erforderliche Tests:**
- Server-Layer: Request/Response-Verträge der neuen Routen, SSE-Stream-Verhalten (vitest, ggf. Fake Timers analog `tick-scheduler.test.ts`).
- Presentation-State-/Formatierungslogik (Auswahl-Handling, Datenaufbereitung für den Client) als reine, isoliert testbare Funktionen — analog `interactiveFormat.test.ts`.
- Kein neuer Test für `domain/`/`world/`/`simulation/` nötig (unverändert) — bestehende 216 Tests müssen weiterhin grün bleiben.

**Wie der MVP manuell geprüft wird:**
1. Lokalen Server starten, Browser öffnen, Weltübersicht erscheint mit Tick/Season/Weather/Orts-Graph/Population.
2. Play → Tick-Zähler und Event-Feed aktualisieren sich live; Pause → beide frieren ein; Step → exakt n Ticks; Speed ändern → nur Kadenz ändert sich, kein Sprung im Zustand.
3. Ort anklicken → Ortsdetail mit korrekten Personen-/Tierzahlen und Gebäuden; Person anklicken → Personendetail mit allen in 26.11 gelisteten Feldern; Klick auf Partner/Freund/Elternteil/Kind navigiert korrekt weiter.
4. Save über UI, Anwendung/Server neu starten, Load über UI → identischer Zustand wie vor dem Save (Kreuzvergleich gegen das bestehende CLI-Save/Load als Referenz, wie in Subtask 21 bereits für die CLI verifiziert).
5. Bestehender CLI-Modus (`npm run sim`, `npm run sim:interactive`) funktioniert weiterhin unverändert.

**Geltende Architekturgrenzen:** exakt die in 26.16 gelisteten.

**Akzeptanzkriterien:**
- Alle bestehenden 216 Tests weiterhin grün, `npm run typecheck`/`npm run build` weiterhin fehlerfrei.
- Neue Server-/Presentation-Tests grün.
- MVP-Funktionsumfang aus 26.13 vollständig manuell verifiziert (Schritte oben).
- Keine der in 26.16 gelisteten Architekturregeln verletzt (insbesondere: keine direkte `WorldState`-Mutation aus der neuen Presentation, keine neuen `SimEvent`-Typen, kein UI-Zustand in `WorldState`/`SaveFile`).
- Bestehender CLI-Modus unverändert funktionsfähig.

---

## 26.19 Offene Punkte

Nur echte, noch zu treffende Entscheidungen (nicht bereits in diesem Dokument beantwortet):

1. **Snapshot-Diffing für Beziehungsänderungen (26.12):** direkt in Subtask 23 mitbauen oder als eigener Folge-Subtask? Empfehlung dieses Dokuments: separat, nach dem MVP — aber das ist eine Priorisierungsfrage, keine technische.
2. **Tierdetailansicht:** Teil des MVP (wie in 26.13 empfohlen, da nahezu kostenlos) oder direkt danach? Offen für Rücksprache, falls der MVP möglichst minimal gehalten werden soll.
3. **`getConfig()`-Getter / abgeleitete Kalender-/Seed-Anzeige (26.15):** jetzt als kleine, explizit genannte Erweiterung mitnehmen, oder bewusst ganz weglassen und nur mit rohem Tick-Zähler arbeiten? Beides ist mit diesem Konzept vereinbar.
4. **Konkretes visuelles Styling/Branding** (Farben, Typografie, genaues Layout-Raster) — bewusst nicht Teil dieses Konzepts, das Struktur und Inhalt, nicht Pixel-Design festlegt.
5. **Genaue Default-Geschwindigkeit(en)/Presets** für die neue UI — kosmetische Detailentscheidung, kann in Subtask 23 direkt getroffen werden.

---

## 26.20 Abschlussentscheidung

Die Konzeption wird als **verbindliche Grundlage für die nächste Implementierungsphase freigegeben**. Sie ist vollständig aus dem tatsächlichen, code-verifizierten Domänenmodell und der eingefrorenen Observation-/Application-Architektur abgeleitet, verletzt an keiner Stelle die in 26.16 gelisteten Architekturgrenzen, benötigt für den definierten MVP keine neue Domänenlogik, und beantwortet die Leitfrage des Auftrags konkret:

> *„Wenn ich morgen die Living World öffne, sehe ich eine Weltübersicht mit Zeit, Jahreszeit, Wetter, den Orten und ihrer Bevölkerung sowie den jüngsten Ereignissen. Ich kann die Zeit laufen lassen, pausieren, verlangsamen oder beschleunigen. Ich kann in jeden Ort und in jede Person hineinzoomen und sehe dort ihre Bedürfnisse, ihre Aktivität und ihr soziales Netz — Partner, Freunde, Eltern, Kinder — jeweils einen Klick voneinander entfernt. Ich entdecke Neues über den Ereignis-Feed, der mich zu Geburten, Todesfällen und auffälligen Momenten führt. Ich kann nichts davon steuern — nur zusehen, verweilen, wiederkommen. Ich bleibe, weil die Personen, die ich beobachte, sich unabhängig von mir weiterentwickeln, und weil mich interessiert, was aus ihnen wird.“*
