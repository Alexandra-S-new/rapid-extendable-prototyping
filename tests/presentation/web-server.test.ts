import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createWebServer } from '../../src/presentation/web/server.js';
import { SimulationEngine } from '../../src/application/SimulationEngine.js';
import { SimulationController } from '../../src/application/SimulationController.js';
import { ConsoleLogger } from '../../src/observability/Logger.js';
import { MemoryRawStorage } from '../helpers/MemoryRawStorage.js';
import { makeTestConfig } from '../helpers/testConfig.js';

// web/server.ts (Subtask 23 §34): Integrationstests über echte HTTP-
// Requests gegen einen echten node:http-Server (kein Framework, daher auch
// kein Framework-Testadapter nötig) — verifiziert Verträge der Routen sowie
// die harten Architekturregeln (kein zweiter Simulationslauf, ausschließlich
// Presentation-Daten in den Antworten).

interface Harness {
  server: Server;
  baseUrl: string;
  controller: SimulationController;
  storage: MemoryRawStorage;
}

async function startHarness(configOverrides?: Parameters<typeof makeTestConfig>[0]): Promise<Harness> {
  const logger = new ConsoleLogger('error');
  const storage = new MemoryRawStorage();
  const config = makeTestConfig(configOverrides);
  const engine = SimulationEngine.create(config, logger);
  const controller = new SimulationController(engine, logger);
  const server = createWebServer({
    controller,
    storage,
    logger,
    staticDir: join(tmpdir(), 'living-world-web-test-missing-dir'),
    initialConfig: config,
    ssePollIntervalMs: 30,
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a bound TCP address');
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, controller, storage };
}

function stopHarness(harness: Harness): Promise<void> {
  return new Promise((resolveClose) => harness.server.close(() => resolveClose()));
}

// Node's fetch typings (@types/node, kein DOM-lib in tsconfig.json) geben für
// Response.json() bewusst `unknown` zurück — dieser Test-Helper kapselt das
// an einer Stelle, statt in jedem Test einzeln zu casten.
async function json(res: Response): Promise<any> {
  return res.json();
}

let harness: Harness;

afterEach(async () => {
  if (harness) await stopHarness(harness);
});

describe('GET /api/world', () => {
  it('liefert Tick/Season/Weather/Population/Orte inkl. Graph-Kanten, ohne volle Personen-/Tierlisten', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/world`);
    expect(res.status).toBe(200);
    const body = await json(res);

    expect(body.tick).toBe(0);
    expect(body.season).toBe('Spring');
    expect(body.weather).toBe('Clear');
    expect(body.peopleCount).toBe(4);
    expect(body.animalsCount).toBe(2);
    expect(body.status).toEqual({ state: 'stopped', currentTick: 0, ticksPerSecond: 1 });
    expect(body.locations).toHaveLength(2);
    expect(body.locations[0].connections[0]).toEqual({ to: 2, travelTicks: 1 });
    expect(body.people).toBeUndefined();
    expect(body.animals).toBeUndefined();
  });
});

describe('GET /api/person/:id, /api/animal/:id, /api/location/:id', () => {
  it('liefert eine bekannte Person mit aufgelösten Beziehungsnamen', async () => {
    harness = await startHarness();
    const snapshot = harness.controller.getObserver().getWorldSnapshot();
    const person = snapshot.people[0]!;

    const res = await fetch(`${harness.baseUrl}/api/person/${person.id}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(person.id);
    expect(body.displayName).toBe(person.displayName);
    expect(Array.isArray(body.friends)).toBe(true);
  });

  it('liefert 404 für eine unbekannte Personen-ID', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/person/999999`);
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBeDefined();
  });

  it('liefert ein bekanntes Tier', async () => {
    harness = await startHarness();
    const snapshot = harness.controller.getObserver().getWorldSnapshot();
    const animal = snapshot.animals[0]!;
    const res = await fetch(`${harness.baseUrl}/api/animal/${animal.id}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(animal.id);
    expect(body.needs.social).toBeUndefined();
  });

  it('liefert 404 für ein unbekanntes Tier', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/animal/999999`);
    expect(res.status).toBe(404);
  });

  it('liefert Ortsdetails inkl. kompakter Bewohnerlisten', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/location/1`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.name).toBe('Village');
    expect(Array.isArray(body.people)).toBe(true);
    expect(Array.isArray(body.buildings)).toBe(true);
  });

  it('liefert 404 für einen unbekannten Ort', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/location/999999`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/events', () => {
  it('respektiert das last-Limit und liefert eine leere Liste ohne Ereignisse', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/events?last=5`);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
  });

  it('lehnt einen unbekannten Event-Typ mit 400 ab', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/events?type=NotARealEvent`);
    expect(res.status).toBe(400);
  });
});

describe('Simulation-Commands', () => {
  it('Step führt exakt die angeforderte Anzahl Ticks aus, sichtbar in Status und Weltübersicht', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/simulation/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticks: 3 }),
    });
    expect(res.status).toBe(200);
    expect((await json(res)).currentTick).toBe(3);

    const worldRes = await fetch(`${harness.baseUrl}/api/world`);
    expect((await json(worldRes)).tick).toBe(3);
  });

  it('Start/Pause/Resume durchlaufen die erwarteten Zustände', async () => {
    harness = await startHarness();
    const startRes = await fetch(`${harness.baseUrl}/api/simulation/start`, { method: 'POST' });
    expect((await json(startRes)).state).toBe('running');

    const pauseRes = await fetch(`${harness.baseUrl}/api/simulation/pause`, { method: 'POST' });
    expect((await json(pauseRes)).state).toBe('paused');

    const resumeRes = await fetch(`${harness.baseUrl}/api/simulation/resume`, { method: 'POST' });
    expect((await json(resumeRes)).state).toBe('running');
  });

  it('Speed ändert nur die Kadenz und lehnt ungültige Werte mit 400 ab', async () => {
    harness = await startHarness();
    const ok = await fetch(`${harness.baseUrl}/api/simulation/speed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticksPerSecond: 5 }),
    });
    expect(ok.status).toBe(200);
    expect((await json(ok)).ticksPerSecond).toBe(5);

    const invalid = await fetch(`${harness.baseUrl}/api/simulation/speed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticksPerSecond: -1 }),
    });
    expect(invalid.status).toBe(400);
  });

  it('lehnt einen ungültigen Command-Body mit 400 statt eines Absturzes ab', async () => {
    harness = await startHarness();
    const missingField = await fetch(`${harness.baseUrl}/api/simulation/speed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingField.status).toBe(400);

    const malformedJson = await fetch(`${harness.baseUrl}/api/simulation/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    });
    expect(malformedJson.status).toBe(400);
  });
});

describe('POST /api/simulation/restart (Subtask 25 §9)', () => {
  it('startet eine frische, initialisierte Welt bei Tick 0 (kein bloßes Client-seitiges Nullsetzen)', async () => {
    harness = await startHarness({ seed: 7 });
    await fetch(`${harness.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 10 }) });
    expect((await json(await fetch(`${harness.baseUrl}/api/world`))).tick).toBe(10);

    const res = await fetch(`${harness.baseUrl}/api/simulation/restart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    expect(res.status).toBe(200);
    expect((await json(res)).currentTick).toBe(0);
    expect((await json(await fetch(`${harness.baseUrl}/api/world`))).tick).toBe(0);
  });

  it('verwendet ohne explizite Angabe denselben (initialen) Seed — reproduzierbarer Ausgangszustand (Subtask 25 §9.3)', async () => {
    const a = await startHarness({ seed: 99 });
    const b = await startHarness({ seed: 99 });
    try {
      await fetch(`${a.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 20 }) });
      await fetch(`${a.baseUrl}/api/simulation/restart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      await fetch(`${a.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 15 }) });
      await fetch(`${b.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 15 }) });

      // status.state selbst wird bewusst nicht verglichen: restart() setzt
      // den Controller analog zu load() auf 'paused' (Server A durchlief
      // einen Restart), während Server B nie gestartet wurde und bei
      // 'stopped' verbleibt — ein reines Artefakt dieses Testaufbaus, keine
      // Simulationsdivergenz. Die eigentliche Weltwahrheit (Tick/Season/
      // Weather/Figuren/Events) muss trotzdem identisch sein.
      const { status: statusA, ...worldA } = await json(await fetch(`${a.baseUrl}/api/world`));
      const { status: statusB, ...worldB } = await json(await fetch(`${b.baseUrl}/api/world`));
      expect(worldA).toEqual(worldB);
      expect(statusA.currentTick).toBe(statusB.currentTick);
    } finally {
      await stopHarness(a);
      await stopHarness(b);
    }
  });

  it('akzeptiert einen expliziten abweichenden Seed und erzeugt dann eine andere Welt', async () => {
    harness = await startHarness({ seed: 1 });
    const res = await fetch(`${harness.baseUrl}/api/simulation/restart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 2 }),
    });
    expect(res.status).toBe(200);
    await fetch(`${harness.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 30 }) });
    const worldWithSeed2 = await json(await fetch(`${harness.baseUrl}/api/world`));

    const reference = await startHarness({ seed: 1 });
    try {
      await fetch(`${reference.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 30 }) });
      const worldWithSeed1 = await json(await fetch(`${reference.baseUrl}/api/world`));
      expect(worldWithSeed2).not.toEqual(worldWithSeed1);
    } finally {
      await stopHarness(reference);
    }
  });

  it('lehnt einen nicht-ganzzahligen Seed mit 400 ab statt abzustürzen', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/simulation/restart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 1.5 }),
    });
    expect(res.status).toBe(400);
  });

  it('erzeugt keinen zweiten Simulationslauf — nach Restart bleibt der Tick ohne erneuten Start bei 0', async () => {
    harness = await startHarness();
    await fetch(`${harness.baseUrl}/api/simulation/restart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    await new Promise((r) => setTimeout(r, 300));
    expect((await json(await fetch(`${harness.baseUrl}/api/world`))).tick).toBe(0);
  });
});

describe('unbekannte Routen', () => {
  it('liefert 404 statt eines Stacktraces', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBeDefined();
  });
});

describe('Save/Load über die Web-API (bestehende Persistenzsemantik, Subtask 23 §22)', () => {
  it('Save/Load verwenden SimulationController.save/load unverändert und liefern denselben Zustand zurück', async () => {
    harness = await startHarness();
    await fetch(`${harness.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 5 }) });

    const saveRes = await fetch(`${harness.baseUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/save.json' }),
    });
    expect(saveRes.status).toBe(200);
    expect(await harness.storage.read('/save.json')).toBeTypeOf('string');

    await fetch(`${harness.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 5 }) });
    expect((await json(await fetch(`${harness.baseUrl}/api/world`))).tick).toBe(10);

    const loadRes = await fetch(`${harness.baseUrl}/api/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/save.json' }),
    });
    expect(loadRes.status).toBe(200);
    expect((await json(loadRes)).currentTick).toBe(5);
    expect((await json(await fetch(`${harness.baseUrl}/api/world`))).tick).toBe(5);
  });

  it('Load mit unbekanntem Pfad liefert 400 statt eines Absturzes', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/does-not-exist.json' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('SSE — GET /api/events/stream', () => {
  it('Verbindung kann hergestellt werden, sendet eine gültige SSE-Nachricht und kann geschlossen werden', async () => {
    harness = await startHarness();
    const res = await fetch(`${harness.baseUrl}/api/events/stream`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = Buffer.from(value!).toString('utf-8');
    expect(text).toContain('event: world-changed');
    expect(text).toContain('data:');

    await reader.cancel();
  });

  it('mehrere gleichzeitige Verbindungen (mehrere Browserfenster) erhalten unabhängig voneinander Nachrichten', async () => {
    harness = await startHarness();
    const resA = await fetch(`${harness.baseUrl}/api/events/stream`);
    const resB = await fetch(`${harness.baseUrl}/api/events/stream`);
    const readerA = resA.body!.getReader();
    const readerB = resB.body!.getReader();

    await readerA.read();
    await readerB.read();

    await fetch(`${harness.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 1 }) });

    const [nextA, nextB] = await Promise.all([readerA.read(), readerB.read()]);
    expect(Buffer.from(nextA.value!).toString('utf-8')).toContain('event: world-changed');
    expect(Buffer.from(nextB.value!).toString('utf-8')).toContain('event: world-changed');

    await readerA.cancel();
    await readerB.cancel();
  });

  it('treibt keine eigene Simulationszeit an — Tick bleibt ohne Start unverändert, während der SSE-Poll läuft', async () => {
    harness = await startHarness();
    await fetch(`${harness.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 2 }) });

    const streamRes = await fetch(`${harness.baseUrl}/api/events/stream`);
    const reader = streamRes.body!.getReader();
    await reader.read();

    await new Promise((r) => setTimeout(r, 200));

    const world = await json(await fetch(`${harness.baseUrl}/api/world`));
    expect(world.tick).toBe(2);

    await reader.cancel();
  });
});

describe('Determinismus über die Web-API (Subtask 23 §37)', () => {
  it('zwei unabhängige Server mit gleichem Seed liefern nach identischen Commands denselben Weltzustand', async () => {
    const a = await startHarness({ seed: 4242 });
    const b = await startHarness({ seed: 4242 });
    try {
      for (const h of [a, b]) {
        await fetch(`${h.baseUrl}/api/simulation/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticks: 15 }) });
      }
      const worldA = await json(await fetch(`${a.baseUrl}/api/world`));
      const worldB = await json(await fetch(`${b.baseUrl}/api/world`));
      expect(worldA).toEqual(worldB);
    } finally {
      await stopHarness(a);
      await stopHarness(b);
    }
  });
});

describe('Statisches Ausliefern des Web-Clients', () => {
  let staticDir: string;
  let harness2: Harness;

  beforeAll(async () => {
    staticDir = await mkdtemp(join(tmpdir(), 'living-world-static-'));
    await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>Living World</title>');
  });

  afterAll(async () => {
    await rm(staticDir, { recursive: true, force: true });
  });

  it('liefert index.html unter / und als SPA-Fallback für unbekannte Pfade aus', async () => {
    const logger = new ConsoleLogger('error');
    const config = makeTestConfig();
    const engine = SimulationEngine.create(config, logger);
    const controller = new SimulationController(engine, logger);
    const server = createWebServer({ controller, storage: new MemoryRawStorage(), logger, staticDir, initialConfig: config });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected a bound TCP address');
    harness2 = { server, baseUrl: `http://127.0.0.1:${address.port}`, controller, storage: new MemoryRawStorage() };

    const root = await fetch(`${harness2.baseUrl}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('Living World');

    const fallback = await fetch(`${harness2.baseUrl}/some/deep/path`);
    expect(fallback.status).toBe(200);

    await stopHarness(harness2);
  });
});
