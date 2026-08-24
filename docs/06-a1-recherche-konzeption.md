# Subtask 15/16 — A1 Recherche & Konzeption: Erweiterter Sozialgraph

> **V2 BASELINE FROZEN** — dieses Dokument beschreibt ausschließlich die geplante A1-Entwicklung (nächste Stufe nach dem in Subtask 13 bestätigten v2-Freeze). Es verändert, korrigiert oder relativiert keine Aussage der eingefrorenen v1-Baseline (`01`–`03.5`) oder der eingefrorenen v2-Baseline (`04`, `05`). Die hier getroffenen Entscheidungen wurden bereits in Subtask 15 fachlich hergeleitet; dieses Dokument formalisiert sie redaktionell, ohne sie neu zu entscheiden.

Legende: **Erkenntnis** · **Bestandsbefund** (aus v1/v2-Code) · **Option** · **Bewertung** · **Entscheidung** (verbindlich für A1) · **Risiko** · **Offene Frage** (bewusst vertagt, kein Blocker).

---

## 1. Ausgangslage nach V2

Die V2-Baseline ist eingefroren (Subtask 13: „V2 BASELINE FROZEN — FREEZE BESTÄTIGT"). Sie umfasst neun ADRs (ADR-V2-01–09), zehn Invarianten-Zeilen (V2-I1–V2-I9 inkl. V2-I2b), sechs Actions (Eat, Sleep, Socialize, Work, Trade, Care), elf Systeme, ein vollständiges Save/Load mit `schemaVersion=2` und 133 grüne Tests. Subtask 14 hat als nächste Entwicklungsstufe **A1 — Erweiterter Sozialgraph** identifiziert; Subtask 15 hat A1 fachlich und architektonisch vollständig spezifiziert (Ergebnis: „A1 FACHLICH SPEZIFIZIERT — BEREIT FÜR IMPLEMENTIERUNG"). Dieses Dokument überführt die Subtask-15-Entscheidungen in die verbindliche Projektdokumentation.

## 2. Motivation für A1

`Relationships` kennt bislang ausschließlich `parentIds`/`childIds` (v1) und `partnerId` (v2) — keine Beziehung, die nicht Abstammung oder Fortpflanzung voraussetzt. A1 schließt diese Lücke minimal: eine binäre, reziproke Freundschaftsbeziehung, die deterministisch aus gemeinsamer sozialer Aktivität entsteht und dauerhaft (bis zum Tod) beobachtbar bleibt.

## 3. Bezug zu `docs/01-recherche-konzeption.md`

`01` §3.2 nennt „Beziehungen/Sozialgraph über Eltern-Kind hinaus" seit Subtask 1 als eine der „sinnvollen Erweiterungen (bewusst zurückgestellt, Architektur muss sie zulassen)". A1 ist damit keine neu erfundene Anforderung, sondern die Einlösung der ältesten, konsistent anerkannten offenen Ambition des Projekts.

## 4. Bezug zu `docs/04-v2-recherche-konzeption.md`

`04`, Abschnitt „v1-Verträglichkeits-Klassifikation", stufte „Erweiterter Sozialgraph (Partnerschaften/Freundschaften)" bereits in Subtask 8 als **Klasse A** ein („neues Feld auf `Relationships`, kein bestehendes entfernt"). v2 hat daraus ausschließlich die Partnerschaft (`partnerId`) umgesetzt; `05` §8.2 hat Freundschaft/allgemeine soziale Beziehungen ein zweites Mal bewusst zurückgestellt („kein hinreichender v1-Befund, der dies zwingend macht"). A1 setzt exakt an dieser zweimal zurückgestellten Stelle an.

## 5. Zielsetzung

Sichtbare, über die Kernfamilie und Partnerschaft hinausgehende soziale Struktur (wer kennt wen), beobachtbar über die bestehende `inspect`-Funktionalität, **ohne** das Simulationsverhalten (Decision-Scores, Actions, Reproduktion) zu verändern. A1 ist eine reine Beziehungs- und Observability-Schicht.

## 6. Explizite Abgrenzung

A1 leistet ausdrücklich **nicht**: Konflikt/Rivalität, Gruppendynamik/Cliquenbildung, romantische Konkurrenz zu `partnerId`, KI-Verhalten basierend auf Beziehungen, Beeinflussung von Decision-Scores oder Action-Auswahl. Unverändert bleiben: `partnerId`-Semantik vollständig, `Socialize`, `PopulationSystem`, `DecisionSystem`, alle sechs bestehenden Actions, alle elf Systeme, alle v1/v2-Invarianten, alle bisherigen 133 Tests.

## 7. Betrachtete Varianten

### 7.1 Beziehungstyp (Datenmodell)

| Variante | Ausdruckskraft | Komplexität | Invarianten-Risiko | Sackgassen-Risiko | Bewertung |
|---|---|---|---|---|---|
| A — binär, reziprok | ausreichend für das Ziel (Abschnitt 5) | niedrig | keins (keine Exklusivität) | gering (additiv erweiterbar) | **gewählt** |
| B — gerichtet, nicht reziprok | höher (Asymmetrie darstellbar) | mittel | keins | mittel | kein zusätzlicher, hier begründbarer Nutzen gegenüber A |
| C — gewichtet (`strength: 0..100`) | hoch | hoch (erzwingt Auf-/Abbau-Logik) | gering, aber Rückkopplungsrisiko bei jeder späteren Nutzung | hoch (Zahl ohne aktuelle Verwendung ist toter Ballast) | abgelehnt — kein System würde die Zahl aktuell lesen |
| D — mehrere Typen (`friend`/`acquaintance`/`disliked`/`trusted`) | hoch | hoch | keins direkt | hoch (Typen ohne unterschiedliches Systemverhalten sind reine Deko) | abgelehnt — kein Systemverhalten unterscheidet aktuell zwischen Typen |
| E — generisches `Relationship{sourceId,targetId,type,strength}` | sehr hoch | sehr hoch | **hoch** — Gefahr der Vermischung mit `partnerId`/`parentIds`/`childIds` | sehr hoch (Overengineering für einen einzigen Beziehungstyp) | **explizit abgelehnt** — genau die verbotene „elegante Vereinheitlichung", die bestehende V2-Semantik verwässern würde |

### 7.2 Entstehungsmechanismus

| Variante | Determinismus | Zustandsbedarf | Bewertung |
|---|---|---|---|
| A — deterministisch aus co-lokaler, gemeinsamer Aktivität | vollständig (kein RNG) | keiner (nutzt bestehenden `AIState`/`Position`-Zustand) | **gewählt** |
| B — expliziter Zufallsprozess mit Wahrscheinlichkeit | erfordert neuen oder mitgenutzten RNG-Substream | keiner | abgelehnt — kein fachlicher Bedarf für Zufall, würde ADR-V2-07-Präzedenz (kein RNG nur aus Bequemlichkeit) widersprechen |
| C — Score-basiert (`socialCompatibility + coPresence + sharedActivities`) | möglich, aber zusätzliche Bewertungslogik nötig | hoch (mehrdimensionaler Zustand) | abgelehnt — GOAP-artige Zusatzkomplexität ohne identifizierten Bedarf, widerspricht der in `01` §5.1 bereits getroffenen, weiterhin gültigen Ablehnung von GOAP/BDI |

### 7.3 Beziehungsverlauf/Lebenszyklus

| Modell | Bewertung |
|---|---|
| A — Standing-Beziehung, dauerhaft bis zum Tod | **gewählt** — konsistent mit `parentIds`/`childIds`/`partnerId`, kein zusätzlicher Zustand |
| B — dynamische Stärke (0–100, auf-/abbauend) | abgelehnt — erfordert eine Pflege-Logik ohne identifizierten fachlichen Bedarf (s. 7.1, Variante C) |
| C — ereignisbasiertes Entstehen/Verschwinden | abgelehnt — „automatische Veralterung/Auflösung" ist ausdrücklich nur bei fachlichem Zwang zulässig; kein solcher Zwang identifiziert |

## 8. Entscheidung: binäre, reziproke Freundschaft

**Verbindlich (Subtask 15, hier formalisiert):** `Relationships.friendIds: EntityId[]` — Pflichtfeld, stets ein Array (ggf. leer), mehrere Freunde gleichzeitig möglich, keine Exklusivität, keine Kapazitätsgrenze, keine Gewichtung, kein Verblassen. Vollständig getrennt von `parentIds`, `childIds` und `partnerId` — `partnerId` bleibt in Bedeutung und Code unverändert.

## 9. Entstehungsmechanismus

Deterministisch, ohne RNG: Zwei Personen befinden sich am selben Ort und führen gleichzeitig eine `Socialize`-Ausführung aus (`AIState.currentActivity.kind==='Performing' ∧ actionId==='Socialize'`). **Bestandsbefund**: `Socialize` (`src/simulation/decision/actions/Socialize.ts`) ist aktuell eine rein solitäre Aktion ohne Gegenpartei-/Zielauswahl (im Unterschied zu `Trade`/`Care`) — die Entstehungsbedingung wird deshalb nicht in `Socialize` selbst, sondern in einem neuen, eigenständigen System erkannt (Details: `docs/07`). Bei mehreren gleichzeitigen Kandidaten am selben Ort: deterministische Sortierung nach `EntityId`, kein RNG.

## 10. Lebenszyklus

Standing-Beziehung ohne Verblassen, Stärke, Mindestkontaktpflicht oder Kapazitätsgrenze. Endet ausschließlich durch Tod; keine kaskadierende Bereinigung (konsistent mit `parentIds`/`childIds`/`partnerId`). Eine Freundschaft endet **nicht** durch Ortswechsel, fehlenden Kontakt oder Ausbleiben weiterer `Socialize`-Ausführungen.

## 11. Determinismus

Kein neuer RNG-Substream. Die bestehenden fünf Substreams (`weather`, `production`, `reproduction`, `agent-decision`, `agent-action`) bleiben unangetastet. Kandidatenauswahl bei mehreren Kandidaten erfolgt über deterministische `EntityId`-Sortierung.

## 12. Auswirkungen auf bestehende Systeme

`Socialize.ts`, `DecisionSystem.ts`, `PopulationSystem.ts`, `MovementSystem.ts`, `ActionExecutionSystem.ts`, `CleanupSystem.ts` bleiben **unverändert**. A1 fügt ausschließlich ein neues, eigenständiges System hinzu (Details: `docs/07`).

## 13. Persistenz

Neues Pflichtfeld `friendIds: EntityId[]` — da nicht optional-tolerant wie `partnerId?`, ist ein Schema-Versionssprung auf `schemaVersion=3` erforderlich (kein Migrationspfad, ADR-10 unverändert fortgeführt). Details, Referenzintegrität und Validierungsregeln: `docs/07`.

## 14. Scope

Siehe `docs/07` Abschnitt „Scope / Out-of-Scope" für die vollständige, verbindliche Liste. Zusammengefasst: kein generisches Relationship-Framework, keine Gewichtung/Verblassen/Kapazitätsgrenze, keine Socialize-/Decision-Integration, keine Änderung an `partnerId`, kein B3 (wirtschaftliche Vertiefung), keine der in `05` §25/`01` §3.3 bereits dokumentierten Out-of-Scope-Bereiche.

## 15. Risiken

- **Rückkopplungsrisiko bei Socialize-/Decision-Integration**: bewusst vermieden durch die Entscheidung, keine Integration vorzunehmen (Abschnitt 6/14).
- **V2-I2-Fehlermuster-Wiederholung**: strukturell ausgeschlossen — Freundschaft ist nicht exklusiv, besitzt keine Reservierungs-/Neuzuweisungslogik, die zu einer Standing-Invariant-Verletzung analog Subtask 11 führen könnte.
- **Speicher-/Performance-Risiko bei unbegrenzter Anzahl**: bei Zielgröße 100–300 Personen selbst im theoretischen Vollgraph-Fall (≈ n² Einträge) unproblematisch; die seltene, aktivitätsgebundene Entstehungsbedingung macht einen Vollgraph zudem unwahrscheinlich — im Long-Run zu beobachten, kein a-priori-Blocker.
- **Entstehungshäufigkeit unbekannt**: rein empirisch zu klärender Punkt, kein fachlicher Blocker (Abschnitt 18).

## 16. Teststrategie (verbindlich für die Implementierung)

Unit-Tests (Entstehung, Uniqueness, Selbstbeziehungsverbot, Reziprozität, Stabilität bei Ortswechsel/fehlendem Socialize, Verhalten bei Tod, Animal bleibt `friendIds:[]`, kein RNG-Verbrauch, deterministische Kandidatenauswahl), Integrationstest über die echte `SimulationEngine.tick()`-Schleife, ein **Standing-Invariant-Test** nach dem Muster von `tests/simulation/partnership.test.ts` (mehrtickig, mit Ortswechsel, nicht nur unmittelbar nach Entstehung), Persistenztests (Rundreise, Schema-3-Validierung, Ablehnung von Schema 2/ungültigen Referenzen/Selbstreferenz/Duplikaten), Determinismustests (Doppellauf, Save/Load-Fortsetzung), vollständige Regression (alle bestehenden 133 Tests bleiben grün).

## 17. Long-Run-Anforderungen

Mindestens 5000 Ticks, fixer Seed, ca. 20–40 Personen (optional Rollen/Tiere), echte Tick-Schleife, tickweise Prüfung aller sechs neuen A1-Invarianten **und** aller zehn bestehenden V2-Invarianten, keine Exceptions/NaN/Infinity, deterministischer Doppellauf, Persistenz-Fortsetzung, qualitative Beobachtung einer plausiblen (nicht null, nicht sofort vollvernetzten) Entstehungsrate.

## 18. Offene Punkte

1. Endgültige Benennung des neuen Systems und Feldes (Arbeitsnamen `SocialBondingSystem`/`friendIds`, konsistent mit bestehenden Konventionen, aber nicht final zementiert).
2. Empirische Häufigkeit der Entstehungsbedingung — erst im Long-Run der Implementierung zu beobachten.
3. Eventuelle spätere Konfigurierbarkeit (z. B. Mindestdauer) — wäre eine **neue**, hier nicht vorweggenommene Entscheidung, falls der Long-Run dazu Anlass gibt.

Keiner dieser Punkte ist ein Blocker für die Implementierungsbereitschaft.

## 19. Verbindliche A1-Entscheidungen (Zusammenfassung)

Siehe `docs/07`, Abschnitt „Entscheidungsmatrix" für die vollständige, verbindliche Übersicht aller in Subtask 15 getroffenen und hier formalisierten Entscheidungen.

## 20. Übergabe an die Architektur

Die vollständige, verbindliche technische und fachliche A1-Spezifikation (Domänenmodell, Invarianten, ADRs, Architekturfolgen, Persistenz, V2-Kompatibilitätsprüfung) folgt in `docs/07-a1-architektur-domänenmodell.md`. Dieses Dokument (`06`) ist die Recherche-/Optionsgrundlage; `07` ist das verbindliche Entscheidungsdokument, analog dem Verhältnis von `04` zu `05` bei v2.
