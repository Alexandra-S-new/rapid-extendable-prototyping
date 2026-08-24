# Rapid Extendable Prototyping

## Rapid Extendable Prototyping

Entwickle einen komplexen, robusten Proof of Concept (PoC) nach professionellen Standards. Ziel ist eine langlebige, modulare Software-Basis, die über eine einfache Bastelarbeit hinausgeht.

Wähle ein eigenes, anspruchsvolles Thema, mit dem du dich einigermaßen auskennst (z. B. Simulation, Engine, Tool). Der Umfang soll ca. 2000+ Zeilen Code umfassen. Achte auf Wartbarkeit und Erweiterbarkeit.


## Abgabe

Pushe deine Lösung in dieses Repository und warte auf Feedback im Feedback PR.

---

## Living World Simulation Engine — v1

Deterministische, agentenbasierte Simulation einer Kleinstadt (Personen, Tiere, Bedürfnisse, Wirtschaft, Bevölkerung, Wetter/Jahreszeiten, Events, Persistenz). Die vollständige fachliche und architektonische Dokumentation liegt in [`docs/`](./docs/) (Recherche/Konzeption, Architektur, Domänenmodell). Die v1-Baseline ist eingefroren — Details siehe [`docs/02-architektur.md`](./docs/02-architektur.md), Abschnitt „v1 Baseline — frozen after Subtask 7".

### Installation

```
npm install
```

### Typecheck

```
npm run typecheck
```

### Tests

```
npm test
```

### Build

```
npm run build
```

### CLI

```
npm run sim -- run --seed 42 --ticks 100 --save world.json
npm run sim -- stats --load world.json
npm run sim -- events --load world.json --last 20
npm run sim -- inspect --load world.json --entity 1
```
