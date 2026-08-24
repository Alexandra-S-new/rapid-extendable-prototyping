import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import type { SimulationController } from '../../application/SimulationController.js';
import { asEntityId, asLocationId } from '../../domain/value-objects/ids.js';
import type { RawStorage, Logger } from '../../world/ports.js';
import { ConfigurationError, PersistenceError, ValidationError, SimulationError } from '../../domain/errors.js';
import {
  toWorldViewModel,
  toLocationDetailViewModel,
  toPersonDetailViewModel,
  toAnimalDetailViewModel,
  toEventViewModels,
} from './viewModels.js';
import type { SimEventType } from '../../domain/events.js';
import type { SimulationConfig } from '../../config/schema.js';

// server.ts (Subtask 23 §8-§11/§39): dünner node:http-Presentation-Server.
// Spricht ausschließlich mit SimulationController/WorldObserver (niemals mit
// WorldState/SimulationEngine direkt). Kein Framework, kein generisches
// Routing-System — eine kleine, feste Anzahl von Routen wird direkt geprüft.

const EVENT_TYPES: readonly SimEventType[] = [
  'BirthEvent',
  'DeathEvent',
  'TradeEvent',
  'HarvestEvent',
  'MovementEvent',
  'SeasonChangedEvent',
  'WeatherChangedEvent',
  'BuildingConditionChangedEvent',
];

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface CreateWebServerOptions {
  readonly controller: SimulationController;
  readonly storage: RawStorage;
  readonly logger: Logger;
  readonly staticDir: string;
  // initialConfig (Subtask 25 §9.2/§9.3): die beim Start tatsächlich
  // aufgelöste SimulationConfig (identisch mit der, aus der die allererste
  // Engine erzeugt wurde) — einzige Grundlage für "Neue Welt starten"
  // (gleicher Seed per Default, s. §9.3). Keine eigene Seed-Erzeugung hier.
  readonly initialConfig: SimulationConfig;
  readonly defaultEventFeedLimit?: number;
  readonly ssePollIntervalMs?: number;
}

export function createWebServer(options: CreateWebServerOptions): Server {
  const { controller, storage, logger, staticDir, initialConfig } = options;
  const defaultEventFeedLimit = options.defaultEventFeedLimit ?? 30;
  const ssePollIntervalMs = options.ssePollIntervalMs ?? 250;

  // Einzige zentrale SSE-Verteilung für alle verbundenen Browser-Tabs
  // (Subtask 23 §38: "maximal eine zentrale SSE-Verbindung" gilt clientseitig
  // pro Tab; serverseitig genügt hier ein einziger geteilter Poll-Timer statt
  // eines Timers pro Verbindung).
  const sseClients = new Set<ServerResponse>();
  let lastBroadcastStatusJson = '';

  // WICHTIG (Subtask 23 §10/§11, harte Regel): dieser Timer treibt NIEMALS
  // die Simulation an. Er ruft ausschließlich controller.getStatus() — eine
  // reine Lesefunktion über bereits durch den bestehenden
  // SimulationController/TickScheduler berechneten Zustand. Kein
  // engine.tick()/controller.step(), kein eigener WorldState, kein RNG. Er
  // erkennt lediglich, DASS sich etwas geändert hat, und weist den Browser
  // an, den aktuellen Snapshot per GET /api/world erneut abzurufen.
  const pollTimer = setInterval(() => {
    if (sseClients.size === 0) return;
    const status = controller.getStatus();
    const statusJson = JSON.stringify(status);
    if (statusJson === lastBroadcastStatusJson) return;
    lastBroadcastStatusJson = statusJson;
    const payload = `event: world-changed\ndata: ${statusJson}\n\n`;
    for (const client of sseClients) client.write(payload);
  }, ssePollIntervalMs);

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      logger.error(`Unhandled web request error: ${(error as Error).message}`, { tick: controller.getStatus().currentTick });
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal Server Error' });
    });
  });

  server.on('close', () => {
    clearInterval(pollTimer);
    for (const client of sseClients) client.end();
    sseClients.clear();
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    if (pathname === '/api/events/stream' && method === 'GET') {
      handleEventsStream(req, res);
      return;
    }

    if (pathname.startsWith('/api/')) {
      try {
        await handleApi(method, pathname, url.searchParams, req, res);
      } catch (error) {
        handleApiError(error, res);
      }
      return;
    }

    await serveStatic(pathname, res);
  }

  async function handleApi(
    method: string,
    pathname: string,
    query: URLSearchParams,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (method === 'GET' && pathname === '/api/world') {
      const observer = controller.getObserver();
      const snapshot = observer.getWorldSnapshot();
      const limit = parsePositiveIntParam(query.get('eventsLimit'), defaultEventFeedLimit);
      const events = observer.getRecentEvents({ last: limit });
      const graph = observer.getLocationGraph();
      sendJson(res, 200, toWorldViewModel(snapshot, controller.getStatus(), graph, events));
      return;
    }

    const personMatch = pathname.match(/^\/api\/person\/(\d+)$/);
    if (method === 'GET' && personMatch) {
      const id = asEntityId(Number(personMatch[1]));
      const observer = controller.getObserver();
      const person = observer.getPersonObservation(id);
      if (!person) {
        sendJson(res, 404, { error: `Person #${id} nicht gefunden oder nicht mehr lebend.` });
        return;
      }
      const viewModel = toPersonDetailViewModel(person, (otherId) => observer.getPersonObservation(otherId));
      sendJson(res, 200, viewModel);
      return;
    }

    const animalMatch = pathname.match(/^\/api\/animal\/(\d+)$/);
    if (method === 'GET' && animalMatch) {
      const id = asEntityId(Number(animalMatch[1]));
      const observer = controller.getObserver();
      const animal = observer.getAnimalObservation(id);
      if (!animal) {
        sendJson(res, 404, { error: `Tier #${id} nicht gefunden oder nicht mehr lebend.` });
        return;
      }
      const viewModel = toAnimalDetailViewModel(animal, (otherId) => observer.getAnimalObservation(otherId));
      sendJson(res, 200, viewModel);
      return;
    }

    const locationMatch = pathname.match(/^\/api\/location\/(\d+)$/);
    if (method === 'GET' && locationMatch) {
      const id = asLocationId(Number(locationMatch[1]));
      const observer = controller.getObserver();
      const location = observer.getLocationObservation(id);
      if (!location) {
        sendJson(res, 404, { error: `Ort #${id} nicht gefunden.` });
        return;
      }
      const snapshot = observer.getWorldSnapshot();
      const peopleHere = snapshot.people.filter((p) => p.locationId === id);
      const animalsHere = snapshot.animals.filter((a) => a.locationId === id);
      sendJson(res, 200, toLocationDetailViewModel(location, peopleHere, animalsHere));
      return;
    }

    if (method === 'GET' && pathname === '/api/events') {
      const observer = controller.getObserver();
      const last = parsePositiveIntParam(query.get('last'), defaultEventFeedLimit);
      const typeParam = query.get('type');
      const type = typeParam ? assertEventType(typeParam) : undefined;
      const events = observer.getRecentEvents(type ? { last, type } : { last });
      sendJson(res, 200, toEventViewModels(events));
      return;
    }

    if (method === 'POST' && pathname === '/api/simulation/start') {
      controller.start();
      sendJson(res, 200, controller.getStatus());
      return;
    }
    if (method === 'POST' && pathname === '/api/simulation/pause') {
      controller.pause();
      sendJson(res, 200, controller.getStatus());
      return;
    }
    if (method === 'POST' && pathname === '/api/simulation/resume') {
      controller.resume();
      sendJson(res, 200, controller.getStatus());
      return;
    }
    if (method === 'POST' && pathname === '/api/simulation/step') {
      const body = await readJsonBody(req);
      const ticks = extractPositiveInt(body, 'ticks', 1);
      controller.step(ticks);
      sendJson(res, 200, controller.getStatus());
      return;
    }
    if (method === 'POST' && pathname === '/api/simulation/speed') {
      const body = await readJsonBody(req);
      const ticksPerSecond = extractPositiveNumber(body, 'ticksPerSecond');
      controller.setSpeed(ticksPerSecond);
      sendJson(res, 200, controller.getStatus());
      return;
    }
    if (method === 'POST' && pathname === '/api/simulation/restart') {
      const body = await readJsonBody(req);
      const seedOverride = extractOptionalInt(body, 'seed');
      const config = seedOverride !== undefined ? { ...initialConfig, seed: seedOverride } : initialConfig;
      controller.restart(config);
      sendJson(res, 200, controller.getStatus());
      return;
    }
    if (method === 'POST' && pathname === '/api/save') {
      const body = await readJsonBody(req);
      const path = extractNonEmptyString(body, 'path');
      controller.save(path, storage, new Date().toISOString());
      sendJson(res, 200, { ok: true, path });
      return;
    }
    if (method === 'POST' && pathname === '/api/load') {
      const body = await readJsonBody(req);
      const path = extractNonEmptyString(body, 'path');
      controller.load(path, storage);
      sendJson(res, 200, controller.getStatus());
      return;
    }

    sendJson(res, 404, { error: `Unbekannte Route: ${method} ${pathname}` });
  }

  function handleEventsStream(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    res.write(`event: world-changed\ndata: ${JSON.stringify(controller.getStatus())}\n\n`);
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  }

  async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    const requested = pathname === '/' ? '/index.html' : pathname;
    const resolved = resolve(join(staticDir, requested));
    // Verzeichnis-Traversal-Schutz: der aufgelöste Pfad muss innerhalb von
    // staticDir bleiben (Sicherheitsgrundsatz, unabhängig davon, dass die
    // Anwendung nur lokal betrieben wird, Subtask 23 §33).
    if (!resolved.startsWith(resolve(staticDir) + sep) && resolved !== resolve(staticDir)) {
      sendJson(res, 400, { error: 'Invalid path' });
      return;
    }
    try {
      const content = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': contentTypeFor(resolved) });
      res.end(content);
    } catch {
      try {
        const fallback = await readFile(join(staticDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
      } catch {
        sendJson(res, 404, { error: 'Not found. Wurde der Web-Client bereits gebaut (npm run web:build-client)?' });
      }
    }
  }

  function handleApiError(error: unknown, res: ServerResponse): void {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    if (error instanceof ConfigurationError || error instanceof ValidationError || error instanceof PersistenceError || error instanceof RangeError) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    if (error instanceof SimulationError) {
      logger.error(error.message, { tick: error.context.tick });
      sendJson(res, 500, { error: 'Internal simulation error.' });
      return;
    }
    logger.error(`Unexpected API error: ${(error as Error).message}`, { tick: controller.getStatus().currentTick });
    sendJson(res, 500, { error: 'Internal Server Error' });
  }

  return server;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function contentTypeFor(path: string): string {
  switch (extname(path)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 1_000_000) throw new HttpError(400, 'Request body too large.');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}

function parsePositiveIntParam(raw: string | null, fallback: number): number {
  if (raw === null || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new HttpError(400, `Invalid query parameter value: ${raw}`);
  return parsed;
}

function assertEventType(raw: string): SimEventType {
  if ((EVENT_TYPES as readonly string[]).includes(raw)) return raw as SimEventType;
  throw new HttpError(400, `Unknown event type: ${raw}`);
}

function extractPositiveInt(body: unknown, field: string, fallback: number): number {
  const record = asRecord(body);
  const value = record[field];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, `Field "${field}" must be a positive integer.`);
  }
  return value;
}

function extractOptionalInt(body: unknown, field: string): number | undefined {
  const record = asRecord(body);
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new HttpError(400, `Field "${field}" must be an integer.`);
  }
  return value;
}

function extractPositiveNumber(body: unknown, field: string): number {
  const record = asRecord(body);
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new HttpError(400, `Field "${field}" must be a positive, finite number.`);
  }
  return value;
}

function extractNonEmptyString(body: unknown, field: string): string {
  const record = asRecord(body);
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `Field "${field}" must be a non-empty string.`);
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new HttpError(400, 'Request body must be a JSON object.');
  return value as Record<string, unknown>;
}
