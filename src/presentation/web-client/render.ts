import type { ControllerStatus } from '../../application/SimulationController.js';
import type {
  WorldViewModel,
  EventViewModel,
  LocationDetailViewModel,
  PersonDetailViewModel,
  AnimalDetailViewModel,
  RelatedPersonRef,
} from '../web/viewModels.js';
import type { View } from './state.js';

// render.ts (Subtask 23 §12/§14/§15/§16/§17/§28): reine DOM-Aufbaufunktionen,
// eine pro Container (Header/Graph/Events/Detail/Footer) — jede ersetzt
// ausschließlich ihren eigenen Container-Inhalt, nicht die ganze Anwendung
// (Subtask 23 §38). Interaktion läuft über data-Attribute
// (data-cmd/data-nav-kind/data-nav-id), die main.ts per Event-Delegation
// einmalig auswertet — render.ts selbst registriert keine Listener.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export type DetailPayload =
  | { readonly kind: 'world-hint' }
  | { readonly kind: 'location'; readonly data: LocationDetailViewModel }
  | { readonly kind: 'person'; readonly data: PersonDetailViewModel }
  | { readonly kind: 'animal'; readonly data: AnimalDetailViewModel }
  | { readonly kind: 'error'; readonly message: string };

// Menschenlesbare Bezeichnung je Eventtyp für die Filter-Chips (Subtask 24
// §8) — reine Textzuordnung, keine neue Taxonomie: die Schlüssel sind exakt
// die bestehenden SimEvent['type']-Werte, nichts wird hinzugefunden.
const EVENT_TYPE_LABELS: Record<string, string> = {
  BirthEvent: 'Geburt',
  DeathEvent: 'Tod',
  TradeEvent: 'Handel',
  HarvestEvent: 'Ernte',
  MovementEvent: 'Bewegung',
  SeasonChangedEvent: 'Jahreszeit',
  WeatherChangedEvent: 'Wetter',
  BuildingConditionChangedEvent: 'Gebäudezustand',
};

// activityIcon (Subtask 25 §7): rein visuelle Zuordnung zu bereits
// vorhandenen Aktivitäts-/actionId-Werten (Eat/Sleep/Work/Trade/Care/
// Socialize/Traveling/Idle) — keine neue Aktivität, keine erfundene
// Kausalität ("arbeitet, weil..."), nur ein Symbol für einen bereits
// existierenden Zustand.
const ACTIVITY_ICONS: Record<string, string> = {
  Idle: '🌿',
  Traveling: '🚶',
  Eat: '🍖',
  Sleep: '😴',
  Work: '🔨',
  Trade: '💱',
  Socialize: '💬',
  Care: '🤗',
};

function activityIcon(activity: { readonly kind: string; readonly actionId?: string }): string {
  return ACTIVITY_ICONS[activity.actionId ?? activity.kind] ?? '❔';
}

export function renderHeader(el: HTMLElement, world: WorldViewModel): void {
  const status: ControllerStatus = world.status;
  const isRunning = status.state === 'running';
  el.innerHTML = `
    <h1>Living World</h1>
    <div class="time">${escapeHtml(world.season)} · Wetter ${escapeHtml(world.weather)} · Tick ${world.tick}</div>
    <div class="controls">
      <button data-cmd="${isRunning ? 'pause' : status.state === 'paused' ? 'resume' : 'start'}">
        ${isRunning ? '❚❚ Pause' : status.state === 'paused' ? '▶ Resume' : '▶ Start'}
      </button>
      <button data-cmd="step">Step</button>
      <label class="speed">Geschwindigkeit
        <select data-cmd="speed">
          ${[0.5, 1, 2, 5, 10].map((v) => `<option value="${v}" ${status.ticksPerSecond === v ? 'selected' : ''}>${v}×</option>`).join('')}
        </select>
      </label>
      <span class="status-pill status-${status.state}">${status.state}</span>
    </div>
  `;
}

// Höchstens so viele einzelne Figuren pro Ort tatsächlich als eigene,
// anklickbare Marker zeichnen (Subtask 25 §4.1) — der Rest fließt in einen
// "+N"-Sammelindikator. Verhindert, dass ein stark besiedelter Ort (z. B.
// 20+ Personen an einem einzigen Feld) die Karte unlesbar macht; ist reine
// Darstellungsbegrenzung, keine Simulationswirkung.
const MAX_FIGURES_PER_LOCATION = 12;

// renderGraph (Subtask 23 §13, erweitert Subtask 25 §4): Orte + Verbindungen
// wie bisher, zusätzlich ein kleiner Marker pro tatsächlich an diesem Ort
// befindlicher Person/Tier (world.figures — Subtask 25 §12: minimale
// ViewModel-Erweiterung, keine Rohdaten). Marker-Position folgt
// ausschließlich der jeweils aktuellen locationId aus der Simulation; ein
// Ortswechsel erscheint erst nach dem nächsten Refresh am neuen Ort — keine
// interpolierte/erfundene Bewegung zwischen zwei Ticks (§4.2).
export function renderGraph(el: HTMLElement, world: WorldViewModel, selectedLocationId: number | undefined, followedPersonId: number | null = null): void {
  const nodes = world.locations;
  const n = nodes.length;
  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const radius = n <= 1 ? 0 : size / 2 - 90;
  const positions = new Map<number, { x: number; y: number }>();
  nodes.forEach((node, i) => {
    const angle = n <= 1 ? 0 : (2 * Math.PI * i) / n - Math.PI / 2;
    positions.set(node.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  });

  const drawnEdges = new Set<string>();
  const edgeLines: string[] = [];
  for (const node of nodes) {
    for (const connection of node.connections) {
      const key = [node.id, connection.to].sort((a, b) => a - b).join('-');
      if (drawnEdges.has(key)) continue;
      drawnEdges.add(key);
      const from = positions.get(node.id);
      const to = positions.get(connection.to);
      if (!from || !to) continue;
      edgeLines.push(`<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="edge" />`);
    }
  }

  const figuresByLocation = new Map<number, typeof world.figures>();
  for (const figure of world.figures) {
    const list = figuresByLocation.get(figure.locationId) ?? [];
    (list as (typeof world.figures)[number][]).push(figure);
    figuresByLocation.set(figure.locationId, list);
  }

  const nodeGroups = nodes
    .map((node) => {
      const pos = positions.get(node.id)!;
      const selected = node.id === selectedLocationId;
      const figuresHere = figuresByLocation.get(node.id) ?? [];
      const visible = figuresHere.slice(0, MAX_FIGURES_PER_LOCATION);
      const overflow = figuresHere.length - visible.length;
      const perRow = 6;
      const markerStartX = pos.x - ((Math.min(perRow, visible.length) - 1) * 9) / 2;
      const markers = visible
        .map((figure, i) => {
          const mx = markerStartX + (i % perRow) * 9;
          const my = pos.y + 46 + Math.floor(i / perRow) * 9;
          const isFollowed = followedPersonId !== null && figure.kind === 'person' && figure.id === followedPersonId;
          const classes = ['figure', `figure-${figure.kind}`, figure.activityKind === 'Traveling' ? 'figure-traveling' : '', isFollowed ? 'figure-followed' : ''].filter(Boolean).join(' ');
          return `<circle class="${classes}" cx="${mx}" cy="${my}" r="3.2" data-nav-kind="${figure.kind}" data-nav-id="${figure.id}" />`;
        })
        .join('');
      const overflowLabel = overflow > 0 ? `<text x="${pos.x}" y="${pos.y + 46 + Math.ceil(visible.length / perRow) * 9 + 10}" class="figure-overflow">+${overflow}</text>` : '';

      return `
        <g class="location-node${selected ? ' selected' : ''}" data-nav-kind="location" data-nav-id="${node.id}" tabindex="0" role="button" aria-label="Ort ${escapeHtml(node.name)}">
          <circle cx="${pos.x}" cy="${pos.y}" r="34" />
          <text x="${pos.x}" y="${pos.y - 6}" class="node-name">${escapeHtml(node.name)}</text>
          <text x="${pos.x}" y="${pos.y + 12}" class="node-counts">👤${node.personCount} 🐾${node.animalCount}</text>
        </g>
        <g class="figures">${markers}</g>
        ${overflowLabel}
      `;
    })
    .join('');

  el.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Weltkarte mit Orten und Figuren">
      ${edgeLines.join('')}
      ${nodeGroups}
    </svg>
  `;
}

export interface EventFeedOptions {
  readonly knownEventTypes: ReadonlySet<string>;
  readonly activeFilter: ReadonlySet<string>;
  readonly followedPersonId: number | null;
}

// renderEvents (Subtask 23 §17, erweitert Subtask 24 §7/§8/§9): das
// Filtern selbst geschieht bereits vorher in main.ts (reine Funktion
// state.passesEventFilter über bereits abgerufene Events, Subtask 24 §7 —
// "ohne Reload", keine neue Server-Anfrage) — hier wird nur noch die
// (ggf. bereits gefilterte) Liste plus die Filter-Chips selbst gezeichnet.
export function renderEvents(el: HTMLElement, events: readonly EventViewModel[], options: EventFeedOptions): void {
  const alwaysHighlighted = new Set(['BirthEvent', 'DeathEvent', 'SeasonChangedEvent', 'WeatherChangedEvent']);
  const chips = [...options.knownEventTypes]
    .sort()
    .map((type) => {
      const active = options.activeFilter.size === 0 || options.activeFilter.has(type);
      return `<button class="chip ${active ? 'active' : ''}" data-filter-type="${escapeHtml(type)}">${escapeHtml(EVENT_TYPE_LABELS[type] ?? type)}</button>`;
    })
    .join('');
  const filterBar = options.knownEventTypes.size > 0
    ? `<div class="event-filter">${chips}${options.activeFilter.size > 0 ? '<button class="chip reset" data-filter-reset>Alle</button>' : ''}</div>`
    : '';

  const list =
    events.length === 0
      ? '<p class="empty">(keine Ereignisse für den aktuellen Filter)</p>'
      : `<ul class="event-list">${events
          .map((event) => {
            const followsThisPerson = options.followedPersonId !== null && event.links.some((l) => l.kind === 'person' && l.id === options.followedPersonId);
            const links = event.links
              .map((link) => `<button class="link" data-nav-kind="${link.kind}" data-nav-id="${link.id}">${escapeHtml(link.label)}</button>`)
              .join(' ');
            const classes = [alwaysHighlighted.has(event.type) ? 'highlighted' : '', followsThisPerson ? 'followed' : ''].filter(Boolean).join(' ');
            return `
              <li class="${classes}">
                <span class="tick">[${event.tick}]</span> ${escapeHtml(event.summary)}
                ${links ? `<span class="links">${links}</span>` : ''}
              </li>
            `;
          })
          .join('')}</ul>`;

  el.innerHTML = `<h2>Ereignisse</h2>${filterBar}${list}`;
}

export function renderFooter(el: HTMLElement, world: WorldViewModel): void {
  el.innerHTML = `
    <div class="population">Personen: ${world.peopleCount} · Tiere: ${world.animalsCount} · Orte: ${world.locations.length}</div>
    <div class="persistence">
      <button data-cmd="save">Save</button>
      <button data-cmd="load">Load</button>
      <button data-cmd="restart" class="restart">Neue Welt starten</button>
    </div>
  `;
}

function relatedList(title: string, refs: readonly RelatedPersonRef[]): string {
  if (refs.length === 0) return `<div class="rel"><span class="rel-title">${title}:</span> (keine)</div>`;
  const items = refs
    .map(
      (ref) =>
        `<button class="link ${ref.stillAlive ? '' : 'gone'}" ${ref.stillAlive ? `data-nav-kind="person" data-nav-id="${ref.id}"` : 'disabled'}>${escapeHtml(ref.displayName)}</button>`,
    )
    .join(' ');
  return `<div class="rel"><span class="rel-title">${title}:</span> ${items}</div>`;
}

export function renderDetail(el: HTMLElement, view: View, payload: DetailPayload, followedPersonId: number | null): void {
  if (payload.kind === 'error') {
    el.innerHTML = `${navigationBar(view)}<p class="error">${escapeHtml(payload.message)}</p>`;
    return;
  }
  if (payload.kind === 'world-hint') {
    el.innerHTML = `<p class="hint">Wähle einen Ort im Graphen, um hineinzuzoomen.</p>`;
    return;
  }
  if (payload.kind === 'location') {
    const loc = payload.data;
    const people = loc.people.map((p) => `<button class="link" data-nav-kind="person" data-nav-id="${p.id}">${escapeHtml(p.displayName)}</button>`).join(' ') || '(keine)';
    const animals = loc.animals.map((a) => `<button class="link" data-nav-kind="animal" data-nav-id="${a.id}">${escapeHtml(a.displayName)}</button>`).join(' ') || '(keine)';
    const buildings =
      loc.buildings.map((b) => `<li>${escapeHtml(b.kind)}${b.condition !== undefined ? ` (Zustand ${b.condition.toFixed(1)})` : ''}</li>`).join('') ||
      '<li>(keine Gebäude)</li>';
    el.innerHTML = `
      ${navigationBar(view)}
      <h3>Ort: ${escapeHtml(loc.name)}</h3>
      <p>Personen: ${loc.personCount} · Tiere: ${loc.animalCount}</p>
      <h4>Gebäude</h4><ul>${buildings}</ul>
      <h4>Personen hier</h4><p>${people}</p>
      <h4>Tiere hier</h4><p>${animals}</p>
    `;
    return;
  }
  if (payload.kind === 'person') {
    const p = payload.data;
    const isFollowed = followedPersonId === p.id;
    el.innerHTML = `
      ${navigationBar(view)}
      <h3>${escapeHtml(p.displayName)}${p.role ? ` (${escapeHtml(p.role)})` : ''}</h3>
      <button class="follow-toggle ${isFollowed ? 'active' : ''}" data-follow-id="${p.id}">
        ${isFollowed ? '● Beobachtung beenden' : '○ Beobachten'}
      </button>
      <p>${escapeHtml(p.lifeStage)} · Alter ${p.ageTicks} Ticks · <button class="link" data-nav-kind="location" data-nav-id="${p.locationId}">Ort #${p.locationId}</button></p>
      <p>${activityIcon(p.activity)} ${escapeHtml(p.activity.label)}</p>
      <div class="needs">
        ${needBar('Hunger', p.needs.hunger)}
        ${needBar('Energie', p.needs.energy)}
        ${needBar('Sozial', p.needs.social)}
      </div>
      ${relatedList('Partner', p.partner ? [p.partner] : [])}
      ${relatedList('Freunde', p.friends)}
      ${relatedList('Eltern', p.parents)}
      ${relatedList('Kinder', p.children)}
    `;
    return;
  }
  const a = payload.data;
  el.innerHTML = `
    ${navigationBar(view)}
    <h3>${escapeHtml(a.species ?? `Tier #${a.id}`)}</h3>
    <p>${escapeHtml(a.lifeStage)} · Alter ${a.ageTicks} Ticks · <button class="link" data-nav-kind="location" data-nav-id="${a.locationId}">Ort #${a.locationId}</button></p>
    <p>${activityIcon(a.activity)} ${escapeHtml(a.activity.label)}</p>
    <div class="needs">
      ${needBar('Hunger', a.needs.hunger)}
      ${needBar('Energie', a.needs.energy)}
    </div>
    ${relatedList('Eltern', a.parents)}
    ${relatedList('Kinder', a.children)}
  `;
}

export interface FollowPanelOptions {
  readonly relevantEvents: readonly EventViewModel[]; // bereits von main.ts auf diese Person gefiltert
  readonly history: readonly string[]; // kompakter, rein clientseitiger Verlauf (Subtask 25 §8), neueste zuerst
}

// renderFollow (Subtask 24 §9/§10, erweitert Subtask 25 §6/§7/§8):
// persistentes, von der aktuellen Navigationsansicht unabhängiges
// Beobachtungspanel — bleibt sichtbar, während man z. B. gerade eine andere
// Person oder einen Ort betrachtet. Zeigt ausschließlich bereits
// vorhandene PersonDetailViewModel-/EventViewModel-Daten (kein eigener
// simulierter Zustand, keine erfundene Erklärung — nur Aktivität + Icon +
// tatsächliche Bedürfniswerte, so wie vom Server geliefert).
export function renderFollow(el: HTMLElement, followed: PersonDetailViewModel | null, options?: FollowPanelOptions): void {
  if (!followed) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  const moving = followed.activity.kind === 'Traveling';
  const relevantEvents = options?.relevantEvents ?? [];
  const history = options?.history ?? [];
  el.innerHTML = `
    <div class="follow-header">
      <span>👁 Beobachtet: <button class="link" data-nav-kind="person" data-nav-id="${followed.id}">${escapeHtml(followed.displayName)}</button>${moving ? ' <span class="moving-badge">bewegt sich</span>' : ''}</span>
      <button class="follow-toggle active" data-follow-id="${followed.id}">Beenden</button>
    </div>
    <p class="follow-summary">
      ${escapeHtml(followed.lifeStage)} · <button class="link" data-nav-kind="location" data-nav-id="${followed.locationId}">Ort #${followed.locationId}</button>
    </p>
    <p class="follow-activity">${activityIcon(followed.activity)} ${escapeHtml(followed.activity.label)}</p>
    <div class="needs compact">
      ${needBar('Hunger', followed.needs.hunger)}
      ${needBar('Energie', followed.needs.energy)}
      ${needBar('Sozial', followed.needs.social)}
    </div>
    ${relatedList('Partner', followed.partner ? [followed.partner] : [])}
    ${relatedList('Freunde', followed.friends)}
    ${
      relevantEvents.length > 0
        ? `<div class="follow-events"><span class="rel-title">Aktuelle Ereignisse:</span><ul>${relevantEvents
            .slice(0, 5)
            .map((e) => `<li><span class="tick">[${e.tick}]</span> ${escapeHtml(e.summary)}</li>`)
            .join('')}</ul></div>`
        : ''
    }
    ${
      history.length > 0
        ? `<div class="follow-history"><span class="rel-title">Verlauf:</span><ul>${history.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul></div>`
        : ''
    }
  `;
}

function needBar(label: string, value: number): string {
  const pct = Math.max(0, Math.min(100, value));
  // Rein visuelle Schwelle auf einem bereits vorhandenen, tatsächlichen
  // Bedürfniswert (Subtask 25 §7) — keine neue Kausalitätsbehauptung, nur
  // eine Hervorhebung "dieser Wert ist aktuell niedrig".
  const critical = value < 30;
  return `<div class="need${critical ? ' critical' : ''}"><span>${label}</span><div class="need-track"><div class="need-fill" style="width:${pct}%"></div></div></div>`;
}

// navigationBar (Subtask 24 §12/§13): "zurück" (ein Schritt) und "Zur
// Welt" (direkt zur Startseite) sind bewusst getrennte, gleichzeitig
// verfügbare Aktionen — beide nutzen ausschließlich Presentation-State
// (state.ts), nie den Simulationszustand.
function navigationBar(view: View): string {
  if (view.kind === 'world') return '';
  return `
    <div class="nav-bar">
      <button class="back" data-nav-kind="back">← zurück</button>
      <button class="home" data-nav-kind="home">🏠 Zur Welt</button>
    </div>
  `;
}

export function renderConnectionError(el: HTMLElement, message: string): void {
  el.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
}
