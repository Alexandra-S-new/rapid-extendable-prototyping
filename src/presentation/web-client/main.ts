import { api, ApiError, subscribeToUpdates } from './api.js';
import {
  initialState,
  navigateTo,
  navigateBack,
  goHome,
  resetForNewWorld,
  applyLoadRevalidation,
  applyFollowRevalidation,
  followPerson,
  unfollowPerson,
  recordEventTypes,
  toggleEventTypeFilter,
  clearEventFilter,
  passesEventFilter,
  describeFollowChange,
  type UiState,
  type View,
  type FollowSnapshot,
} from './state.js';
import { renderHeader, renderGraph, renderEvents, renderFollow, renderFooter as doRenderFooter, renderDetail, renderConnectionError, type DetailPayload } from './render.js';
import type { WorldViewModel } from '../web/viewModels.js';

// main.ts (Subtask 23 §27, erweitert Subtask 24): Bootstrap des
// Vanilla-TS-Clients. Hält den kleinen, rein präsentationsseitigen UI-State
// (state.ts) und delegiert Rendering an render.ts. Kein Framework, kein
// Redux/Store — "state ändern -> render()" reicht weiterhin (Subtask 24
// §25: additiv erweitert, nicht neu geschrieben).

const els = {
  header: document.getElementById('header')!,
  graph: document.getElementById('graph')!,
  events: document.getElementById('events')!,
  follow: document.getElementById('follow')!,
  detail: document.getElementById('detail')!,
  footer: document.getElementById('footer')!,
  connectionError: document.getElementById('connection-error')!,
  app: document.getElementById('app')!,
};

let state: UiState = initialState();
let latestWorld: WorldViewModel | undefined;

// Rein clientseitige, kompakte "zeitliche Entwicklung" der beobachteten
// Person (Subtask 25 §8) — nur solange dieselbe Person beobachtet wird;
// wird bei jedem Follow-Wechsel/Restart verworfen (keine Persistenz, keine
// Architekturkomplexität, kein Analytics-Unterbau).
let followHistory: string[] = [];
let lastFollowSnapshot: FollowSnapshot | null = null;

async function refreshWorld(): Promise<void> {
  try {
    latestWorld = await api.getWorld();
    els.connectionError.hidden = true;
    state = recordEventTypes(state, latestWorld.recentEvents.map((e) => e.type));
    renderHeader(els.header, latestWorld);
    renderGraphFromLatestWorld();
    renderEventFeed();
    renderFooterFromLatestWorld();
  } catch (error) {
    showConnectionError(error);
  }
}

function renderGraphFromLatestWorld(): void {
  if (!latestWorld) return;
  renderGraph(els.graph, latestWorld, state.view.kind === 'location' ? state.view.id : undefined, state.followedPersonId);
}

function renderEventFeed(): void {
  if (!latestWorld) return;
  const filtered = latestWorld.recentEvents.filter((event) => passesEventFilter(state, event.type));
  renderEvents(els.events, filtered, {
    knownEventTypes: state.knownEventTypes,
    activeFilter: state.eventFilter,
    followedPersonId: state.followedPersonId,
  });
}

function renderFooterFromLatestWorld(): void {
  if (latestWorld) doRenderFooter(els.footer, latestWorld);
}

async function refreshDetail(): Promise<void> {
  const view = state.view;
  try {
    const payload = await loadDetailPayload(view);
    renderDetail(els.detail, view, payload, state.followedPersonId);
    if (view.kind === 'location') {
      renderGraphFromLatestWorld();
    }
  } catch (error) {
    if (error instanceof ApiError) {
      renderDetail(els.detail, view, { kind: 'error', message: error.message }, state.followedPersonId);
    } else {
      showConnectionError(error);
    }
  }
}

async function refreshFollow(): Promise<void> {
  if (state.followedPersonId === null) {
    renderFollow(els.follow, null);
    return;
  }
  try {
    const person = await api.getPerson(state.followedPersonId);
    const tick = latestWorld?.tick ?? 0;
    const nextSnapshot: FollowSnapshot = { locationId: person.locationId, activityLabel: person.activity.label };
    const change = describeFollowChange(lastFollowSnapshot, nextSnapshot, tick);
    if (change) followHistory = [change, ...followHistory].slice(0, 8);
    lastFollowSnapshot = nextSnapshot;

    const relevantEvents = (latestWorld?.recentEvents ?? []).filter((e) => e.links.some((l) => l.kind === 'person' && l.id === person.id));
    renderFollow(els.follow, person, { relevantEvents, history: followHistory });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      state = unfollowPerson(state);
      followHistory = [];
      lastFollowSnapshot = null;
      renderFollow(els.follow, null);
    } else {
      showConnectionError(error);
    }
  }
}

async function loadDetailPayload(view: View): Promise<DetailPayload> {
  switch (view.kind) {
    case 'world':
      return { kind: 'world-hint' };
    case 'location':
      return { kind: 'location', data: await api.getLocation(view.id) };
    case 'person':
      return { kind: 'person', data: await api.getPerson(view.id) };
    case 'animal':
      return { kind: 'animal', data: await api.getAnimal(view.id) };
  }
}

function showConnectionError(error: unknown): void {
  const message = error instanceof ApiError ? error.message : 'Server nicht erreichbar. Läuft der lokale Web-Server noch?';
  renderConnectionError(els.connectionError, message);
  els.connectionError.hidden = false;
}

async function goTo(view: View): Promise<void> {
  state = navigateTo(state, view);
  await refreshDetail();
}

async function goBack(): Promise<void> {
  state = navigateBack(state);
  await refreshDetail();
}

async function goToWorld(): Promise<void> {
  state = goHome(state);
  await refreshDetail();
}

async function toggleFollow(personId: number): Promise<void> {
  state = state.followedPersonId === personId ? unfollowPerson(state) : followPerson(state, personId);
  // Ein Wechsel der beobachteten Person startet den kompakten Verlauf neu
  // (Subtask 25 §8) — er beschreibt ausschließlich die gerade beobachtete
  // Person, keine übergreifende Historie.
  followHistory = [];
  lastFollowSnapshot = null;
  await refreshFollow();
  // Der Follow-Button erscheint auch in der Personendetailansicht selbst —
  // deren "aktiv"-Zustand muss nach dem Umschalten neu gezeichnet werden.
  if (state.view.kind === 'person' && state.view.id === personId) await refreshDetail();
}

function setEventFilter(type: string): void {
  state = toggleEventTypeFilter(state, type);
  renderEventFeed();
}

function resetEventFilter(): void {
  state = clearEventFilter(state);
  renderEventFeed();
}

// afterLoad (Subtask 23 §23, erweitert Subtask 24 §19): der WorldSnapshot
// nach Load ist die neue Wahrheit — eine ausgewählte Person/Ort/Tier UND
// eine beobachtete Person, die darin nicht mehr existiert, werden nicht
// stillschweigend weiter angezeigt.
async function afterLoad(): Promise<void> {
  const view = state.view;
  let viewStillExists = true;
  try {
    if (view.kind === 'location') await api.getLocation(view.id);
    else if (view.kind === 'person') await api.getPerson(view.id);
    else if (view.kind === 'animal') await api.getAnimal(view.id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) viewStillExists = false;
    else throw error;
  }
  state = applyLoadRevalidation(state, viewStillExists);

  let followedStillExists = true;
  if (state.followedPersonId !== null) {
    try {
      await api.getPerson(state.followedPersonId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) followedStillExists = false;
      else throw error;
    }
  }
  state = applyFollowRevalidation(state, followedStillExists);

  await refreshDetail();
  await refreshFollow();
}

// afterRestart (Subtask 25 §9.4): anders als afterLoad() wird die Auswahl/
// Beobachtung hier NICHT erst per Existenz-Check geprüft, sondern
// bedingungslos verworfen (state.ts: resetForNewWorld) — nach einem
// Neustart beginnen Entity-IDs wieder bei 1, sodass ein "existiert noch"
// zufällig zutreffen könnte, dabei aber eine völlig andere, neue Entity
// meinen würde. Der kompakte Follow-Verlauf wird ebenfalls verworfen.
async function afterRestart(): Promise<void> {
  state = resetForNewWorld(state);
  followHistory = [];
  lastFollowSnapshot = null;
  await refreshDetail();
  await refreshFollow();
}

async function runCommand(cmd: string, source: HTMLElement): Promise<void> {
  try {
    switch (cmd) {
      case 'start':
        await api.start();
        break;
      case 'pause':
        await api.pause();
        break;
      case 'resume':
        await api.resume();
        break;
      case 'step':
        await api.step(1);
        break;
      case 'save': {
        const path = window.prompt('Speicherpfad?', './savegame.json');
        if (path) await api.save(path);
        break;
      }
      case 'load': {
        const path = window.prompt('Ladepfad?', './savegame.json');
        if (path) {
          await api.load(path);
          await afterLoad();
        }
        break;
      }
      case 'speed': {
        const value = Number((source as HTMLSelectElement).value);
        await api.setSpeed(value);
        break;
      }
      case 'restart': {
        // Default (leere Eingabe) = derselbe ursprüngliche Seed, also ein
        // reproduzierbarer Ausgangszustand (Subtask 25 §9.3). Eine explizit
        // eingegebene Zahl wählt bewusst eine andere Welt — keine vom
        // Client selbst erzeugte "zufällige" Semantik, die Nutzerin
        // entscheidet.
        const confirmed = window.confirm('Neue Welt starten? Der aktuelle Simulationsfortschritt geht dabei verloren.');
        if (!confirmed) break;
        const seedInput = window.prompt('Seed für die neue Welt (leer = ursprünglicher Seed)?', '');
        const seed = seedInput && seedInput.trim() !== '' ? Number.parseInt(seedInput, 10) : undefined;
        await api.restart(seed);
        await afterRestart();
        break;
      }
    }
    await refreshWorld();
  } catch (error) {
    showConnectionError(error);
  }
}

function handleNav(kind: string, id: string | null): void {
  if (kind === 'back') {
    void goBack();
    return;
  }
  if (kind === 'home') {
    void goToWorld();
    return;
  }
  if ((kind === 'person' || kind === 'animal' || kind === 'location') && id !== null) {
    void goTo({ kind, id: Number(id) } as View);
  }
}

function setupDelegation(): void {
  els.app.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const cmdEl = target.closest<HTMLElement>('[data-cmd]');
    if (cmdEl && cmdEl.tagName !== 'SELECT') {
      void runCommand(cmdEl.dataset.cmd!, cmdEl);
      return;
    }

    const followEl = target.closest<HTMLElement>('[data-follow-id]');
    if (followEl) {
      void toggleFollow(Number(followEl.dataset.followId));
      return;
    }

    const filterTypeEl = target.closest<HTMLElement>('[data-filter-type]');
    if (filterTypeEl) {
      setEventFilter(filterTypeEl.dataset.filterType!);
      return;
    }

    const filterResetEl = target.closest<HTMLElement>('[data-filter-reset]');
    if (filterResetEl) {
      resetEventFilter();
      return;
    }

    const navEl = target.closest<HTMLElement>('[data-nav-kind]');
    if (navEl) {
      handleNav(navEl.dataset.navKind!, navEl.dataset.navId ?? null);
    }
  });

  els.app.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (target.matches('[data-cmd="speed"]')) {
      void runCommand('speed', target);
    }
  });
}

async function bootstrap(): Promise<void> {
  setupDelegation();
  await refreshWorld();
  await refreshDetail();
  await refreshFollow();
  subscribeToUpdates(() => {
    void refreshWorld();
    if (state.view.kind !== 'world') void refreshDetail();
    void refreshFollow();
  });
}

void bootstrap();
