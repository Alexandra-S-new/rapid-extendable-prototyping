# Rapid Extendable Prototyping

# Living World Simulation Engine

Ein deterministischer, agentenbasierter Simulations-Prototyp einer kleinen Welt mit Personen, Tieren, Bedürfnissen und wirtschaftlichen Interaktionen.

Das Projekt entstand im Rahmen von Rapid Extendable Prototyping als Proof of Concept (PoC) und wurde als KI-first Entwicklungsprojekt umgesetzt. Die Simulation verbindet eine klar geschichtete TypeScript-Architektur mit deterministischen Simulationsläufen, einer einfachen Utility-KI, persistierbaren Zuständen und zwei unabhängigen Präsentationswegen: einer CLI und einer interaktiven Web-Oberfläche.

## Projektüberblick

Die Living World Simulation Engine bildet eine kleine, regelbasierte Welt ab, in der verschiedene Agenten miteinander interagieren und auf Veränderungen ihrer Umgebung reagieren.

Personen verfügen über unterschiedliche Bedürfnisse und können abhängig von ihrer Situation verschiedene Aktionen ausführen. Dazu gehören unter anderem:

- Essen
- Schlafen
- Arbeiten
- Handeln
- Sozialisieren

Die Simulation entwickelt sich über mehrere voneinander getrennte Tick-Systeme. Ereignisse werden über typisierte Events verarbeitet und können sowohl innerhalb der Simulation als auch über die Präsentationsschichten beobachtet werden.

Ein besonderer Schwerpunkt liegt auf Determinismus und Reproduzierbarkeit. Ein zentraler Zufallsgenerator-Orchestrator leitet aus einem Seed deterministische, benannte Teil-Zufallsströme ab. Dadurch können Simulationsläufe reproduzierbar ausgeführt und gespeicherte Zustände zuverlässig wiederhergestellt und weitergeführt werden.

## KI-first Development

Das Projekt wurde nach einem KI-first Entwicklungsansatz umgesetzt.

KI-gestützte Werkzeuge wurden während des gesamten Entwicklungsprozesses für Ideenfindung, Konzeption und Implementierung eingesetzt. Gleichzeitig wurden Architekturentscheidungen, technische Validierung und Qualitätssicherung eigenständig überprüft und durch automatisierte Tests abgesichert.

Der Fokus lag damit nicht auf einer unkontrollierten Codegenerierung, sondern auf einem strukturierten Entwicklungsprozess, bei dem KI als Werkzeug zur Beschleunigung von Exploration, Umsetzung und Iteration eingesetzt wurde.

## Architektur

Die Anwendung ist in mehrere klar getrennte Bereiche gegliedert:

- **Domain** – zentrale Modelle und fachliche Strukturen
- **World** – Weltzustand und Beziehungen zwischen den Elementen
- **Simulation** – Simulationslogik und Tick-Systeme
- **Application** – Anwendungslogik und Steuerung
- **Observability** – Beobachtung und Auswertung von Simulationsereignissen
- **Persistence** – Speichern und Laden von Simulationszuständen
- **Presentation** – CLI und Web-Oberfläche

Diese Trennung ermöglicht es, die Simulationslogik unabhängig von den jeweiligen Präsentationswegen zu verwenden.

## Simulation

Die Welt wird schrittweise über unabhängige Tick-Systeme weiterentwickelt.

Dabei werden unter anderem Zustände und Bedürfnisse der Agenten aktualisiert, Aktionen ausgeführt und Ereignisse erzeugt.

Die Simulation verwendet:

- 12 unabhängige Tick-Systeme
- 7 Event-Typen
- 6 Aktionstypen der Utility-KI
- deterministische, benannte Zufallsströme
- persistierbare Simulationszustände

Die Utility-KI entscheidet anhand des aktuellen Zustands eines Agenten, welche Aktion als sinnvoll bewertet wird.

## Determinismus

Ein zentraler Bestandteil des Projekts ist die reproduzierbare Ausführung der Simulation.

Aus einem initialen Seed werden benannte Teil-Zufallsströme abgeleitet. Dadurch können unterschiedliche Bereiche der Simulation kontrolliert mit Zufallswerten arbeiten, ohne die Reproduzierbarkeit des Gesamtablaufs zu verlieren.

Das ermöglicht unter anderem:

1. Simulation mit einem bestimmten Seed starten
2. Simulationszustand speichern
3. Simulation weiterlaufen lassen
4. gespeicherten Zustand wieder laden
5. Simulation deterministisch fortsetzen

Der Determinismus des Speicher-/Ladezyklus wird durch dedizierte automatisierte Tests überprüft.

## Präsentation

Die Engine kann über zwei unabhängige Präsentationswege verwendet werden.

### CLI

Die Kommandozeilenoberfläche ermöglicht unter anderem:

- Simulationsläufe auszuführen
- Zustände zu speichern
- gespeicherte Zustände zu laden
- Simulationsläufe zu inspizieren

### Web-Oberfläche

Die Web-Oberfläche visualisiert die simulierte Welt als interaktive SVG-Karte.

Dargestellt werden unter anderem:

- Orte
- Verbindungen
- Personen
- Tiere
- Interaktionen und Ereignisse

Einzelne Elemente können angeklickt und näher betrachtet werden.

Zusätzlich gibt es einen Event-Feed mit Filtermöglichkeit sowie eine „Beobachten“-Funktion, mit der die Entwicklung einzelner Personen über einen Live-Verlauf verfolgt werden kann.

## Beobachtete Emergenz

Ein interessantes Ergebnis der Simulation war das Auftreten von Verhalten, das nicht als konkreter Ablauf vorgegeben wurde.

In einem Testlauf entstand aus dem Zusammenspiel der implementierten Regeln und Agentenaktionen eigenständig eine Partnerschaft und anschließend eine Geburt.

Das Projekt untersucht damit nicht nur die technische Umsetzung einer Simulation, sondern auch die Frage, welche komplexeren Verhaltensmuster aus vergleichsweise einfachen Regeln entstehen können.

## Tests

Die Engine ist umfassend automatisiert getestet.

287 von 287 Tests bestehen.

Die Tests decken unter anderem die Simulationslogik, Events, Zustände und den deterministischen Ablauf ab.

Besonderes Augenmerk liegt auf dem Determinismus. Dedizierte Tests überprüfen, dass gespeicherte Simulationszustände geladen und reproduzierbar weitergeführt werden können.

## Technologien

- **TypeScript** – Entwicklung der Simulationslogik und Architektur
- **Node.js** – Laufzeit und CLI
- **Vite** – Web-Entwicklung und Build
- **Vitest** – automatisierte Tests
- **Zod** – Validierung strukturierter Daten

## Projektziele

Das Projekt diente insbesondere dazu, praktische Erfahrungen in folgenden Bereichen zu vertiefen:

- KI-first Development
- agentenbasierte Simulationen
- deterministische Systeme
- reproduzierbare Zufallsprozesse
- ereignisgetriebene Architektur
- Softwarearchitektur und Schichtentrennung
- Persistenz und Wiederherstellung von Zuständen
- Trennung von Simulationslogik und Präsentation
- automatisierte Qualitätssicherung
- Entwicklung komplexer Systeme mit KI-Unterstützung

## Key Learnings

- Entwurf einer erweiterbaren und klar geschichteten Systemarchitektur
- Umsetzung deterministischer Simulationen mit reproduzierbaren, benannten Zufallsströmen
- Konzeption ereignisgetriebener Systeme mit typisierten Events
- Trennung von Simulationslogik und Beobachtung
- Entwicklung eines Systems mit mehreren unabhängigen Präsentationswegen
- Absicherung komplexer Logik durch automatisierte Tests
- Einsatz eines KI-first Entwicklungsansatzes für Ideenfindung, Konzeption und Implementierung

## Status

**Proof of Concept (PoC) – aktiv getestet**

Das Projekt ist als technischer Prototyp konzipiert. Der Schwerpunkt liegt auf der Architektur, der deterministischen Simulation, der Testbarkeit und der Untersuchung emergenter Verhaltensweisen.

