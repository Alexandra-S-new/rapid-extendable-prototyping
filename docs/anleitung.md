# Anleitung — Living World Simulation Engine starten

Diese Anleitung beschreibt, wie man das Projekt lokal einrichtet und die drei
Einstiegspunkte (CLI, interaktiver Modus, Web-Anwendung) startet.

## Voraussetzungen

- Node.js >= 22 (siehe `engines` in [`package.json`](../package.json))
- npm

## Installation

```
npm install
```

## Typprüfung & Tests

```
npm run typecheck
npm test
```

## 1. CLI (Batch-Modus)

Führt eine feste Anzahl Ticks aus und beendet sich danach. Kein
interaktives Pause/Resume.

```
npm run sim -- run --seed 42 --ticks 100 --save world.json
```

Weitere Unterkommandos (arbeiten auf einem zuvor gespeicherten Save):

```
npm run sim -- stats --load world.json
npm run sim -- events --load world.json --last 20
npm run sim -- inspect --load world.json --entity 1
```

Optionen für `run`:

| Option      | Bedeutung                                      |
|-------------|-------------------------------------------------|
| `--seed`    | Zufallsseed für Determinismus                  |
| `--ticks`   | Anzahl Simulationsschritte                     |
| `--config`  | Pfad zu einer eigenen Config-Datei             |
| `--load`    | Von einem Save-Stand fortsetzen (statt neu)    |
| `--save`    | Endzustand unter diesem Pfad speichern         |
| `--humans`  | Anzahl Personen (überschreibt Config)          |
| `--animals` | Anzahl Tiere (überschreibt Config)             |

## 2. Interaktiver Modus (Terminal-Menü)

Startet ein textbasiertes Menü zur Laufzeitsteuerung (Play/Pause, Inspektion
einzelner Personen/Tiere/Orte, Events ansehen usw.).

```
npm run sim:interactive
```

Optional mit denselben Overrides wie oben, z. B.:

```
npm run sim:interactive -- --seed 42 --humans 30 --animals 10
```

Oder von einem gespeicherten Stand fortsetzen:

```
npm run sim:interactive -- --load world.json
```

## 3. Web-Anwendung

Die Web-Variante besteht aus einem Server (`src/presentation/web`) und einem
Vite-Frontend (`src/presentation/web-client`). Das Frontend muss vor dem
ersten Start einmal gebaut werden.

```
npm run web
```

Dieser Befehl baut zuerst den Web-Client (`npm run web:build-client`) und
startet danach den Server. Standardmäßig läuft die Anwendung auf:

```
http://127.0.0.1:4173
```

Im Browser einfach diese Adresse öffnen.

Nützliche Optionen (an den Server-Prozess angehängt):

```
npm run web -- --port 8080 --host 0.0.0.0
npm run web -- --seed 42 --humans 30 --animals 10
npm run web -- --load world.json
```

Nach Änderungen am Frontend-Code (`src/presentation/web-client`) muss der
Client neu gebaut werden:

```
npm run web:build-client
```

Zum Beenden des Servers: `Strg+C` im Terminal (Server pausiert die
Simulation und fährt sauber herunter).

## Build (production, ohne direkten Start)

```
npm run build
```

Kompiliert das Projekt nach `dist/` gemäß `tsconfig.build.json`, ohne einen
Prozess zu starten.
