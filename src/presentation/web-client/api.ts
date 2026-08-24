import type { ControllerStatus } from '../../application/SimulationController.js';
import type {
  WorldViewModel,
  EventViewModel,
  LocationDetailViewModel,
  PersonDetailViewModel,
  AnimalDetailViewModel,
} from '../web/viewModels.js';

// api.ts (Subtask 23 §27): dünner fetch-Wrapper um die Web-API. Reines
// Browser-Modul — importiert Server-Typen ausschließlich als `import type`
// (zur Compile-Zeit entfernt, keine Node-Laufzeitabhängigkeit im
// Browser-Bundle, Subtask 23 §42).

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  return handleResponse<T>(response);
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return handleResponse<T>(response);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Antwort war kein JSON — Statustext bleibt die beste verfügbare Meldung.
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export const api = {
  getWorld(eventsLimit?: number): Promise<WorldViewModel> {
    return getJson(`/api/world${eventsLimit ? `?eventsLimit=${eventsLimit}` : ''}`);
  },
  getPerson(id: number): Promise<PersonDetailViewModel> {
    return getJson(`/api/person/${id}`);
  },
  getAnimal(id: number): Promise<AnimalDetailViewModel> {
    return getJson(`/api/animal/${id}`);
  },
  getLocation(id: number): Promise<LocationDetailViewModel> {
    return getJson(`/api/location/${id}`);
  },
  getEvents(last?: number): Promise<EventViewModel[]> {
    return getJson(`/api/events${last ? `?last=${last}` : ''}`);
  },
  start(): Promise<ControllerStatus> {
    return postJson('/api/simulation/start');
  },
  pause(): Promise<ControllerStatus> {
    return postJson('/api/simulation/pause');
  },
  resume(): Promise<ControllerStatus> {
    return postJson('/api/simulation/resume');
  },
  step(ticks = 1): Promise<ControllerStatus> {
    return postJson('/api/simulation/step', { ticks });
  },
  setSpeed(ticksPerSecond: number): Promise<ControllerStatus> {
    return postJson('/api/simulation/speed', { ticksPerSecond });
  },
  save(path: string): Promise<{ ok: boolean; path: string }> {
    return postJson('/api/save', { path });
  },
  load(path: string): Promise<ControllerStatus> {
    return postJson('/api/load', { path });
  },
  restart(seed?: number): Promise<ControllerStatus> {
    return postJson('/api/simulation/restart', seed !== undefined ? { seed } : {});
  },
};

// subscribeToUpdates (Subtask 23 §10/§38): genau eine zentrale
// SSE-Verbindung pro Browser-Tab. Der Server treibt darüber keine eigene
// Simulationszeit — er teilt nur mit, dass sich etwas geändert hat; die
// eigentlichen Daten werden anschließend ganz normal per GET abgerufen.
export function subscribeToUpdates(onWorldChanged: () => void): () => void {
  const source = new EventSource('/api/events/stream');
  source.addEventListener('world-changed', () => onWorldChanged());
  return () => source.close();
}
