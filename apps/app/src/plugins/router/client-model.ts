import {
  appendTo,
  formatByteRate,
  type NetworkClient,
  type RouterSnapshot,
} from '@smarteverything/domain';
import type { VirtualSection } from '../../components/virtual-list-rows';
import { compareText, plural } from '../../format/text';
import { moment } from '../../format/time';

export const CLIENT_FILTERS = ['online', 'wifi', 'wired', 'people', 'blocked', 'all'] as const;

export type ClientFilter = (typeof CLIENT_FILTERS)[number];

export const FILTER_LABEL: Readonly<Record<ClientFilter, string>> = {
  online: 'Online',
  wifi: 'Wi-Fi',
  wired: 'Wired',
  people: 'People',
  blocked: 'Blocked',
  all: 'All',
};

export const CLIENT_SORTS = ['online', 'name', 'traffic', 'signal'] as const;

export type ClientSort = (typeof CLIENT_SORTS)[number];

export const SORT_LABEL: Readonly<Record<ClientSort, string>> = {
  online: 'Online first',
  name: 'Name',
  traffic: 'Most traffic',
  signal: 'Weakest signal',
};

function isClientFilter(value: string | null): value is ClientFilter {
  return CLIENT_FILTERS.some((filter) => filter === value);
}

export interface ClientEntry {
  readonly client: NetworkClient;
  readonly owner: string | null;
  readonly dbm: number | null;
  readonly rate: string | null;
  readonly subtitle: string;
}

const MATCHES: Readonly<Record<ClientFilter, (client: NetworkClient) => boolean>> = {
  online: (client) => client.connected,
  wifi: (client) => client.connected && client.connection === 'wifi',
  wired: (client) => client.connected && client.connection === 'wired',
  people: (client) => client.profileId !== null,
  blocked: (client) => client.blocked,
  all: () => true,
};

const COLLAPSED_OFFLINE: ReadonlySet<ClientFilter> = new Set(['people', 'all']);

export function connectionText(client: NetworkClient): string {
  if (!client.connected) {
    return 'Offline';
  }
  if (client.connection === 'wired') {
    return 'Wired';
  }
  return client.band === null ? 'Wi-Fi' : `Wi-Fi ${client.band}`;
}

function signalsOf(snapshot: RouterSnapshot): ReadonlyMap<string, number | null> {
  return new Map(snapshot.stations.map((station) => [station.mac, station.rssiDbm] as const));
}

export function signalOf(snapshot: RouterSnapshot, mac: string): number | null {
  return signalsOf(snapshot).get(mac) ?? null;
}

function subtitleOf(client: NetworkClient, now: number): string {
  if (client.connected) {
    return client.ip === null ? connectionText(client) : `${connectionText(client)} · ${client.ip}`;
  }
  return client.lastSeen === null ? 'Offline' : `Last seen ${moment(client.lastSeen, now)}`;
}

export function clientEntries(
  snapshot: RouterSnapshot,
  owners: ReadonlyMap<string, string>,
  now: number,
): readonly ClientEntry[] {
  const live = snapshot.connection.state === 'online';
  const signals = signalsOf(snapshot);
  return snapshot.clients.map((client) => {
    const bytes = client.trafficBytesPerSecond ?? 0;
    return {
      client,
      owner: client.profileId === null ? null : (owners.get(client.profileId) ?? null),
      dbm: live && client.connected ? (signals.get(client.mac) ?? null) : null,
      rate: live && client.connected && bytes > 0 ? formatByteRate(bytes) : null,
      subtitle: subtitleOf(client, now),
    };
  });
}

export function sameEntry(left: ClientEntry, right: ClientEntry): boolean {
  const a = left.client;
  const b = right.client;
  return (
    a.mac === b.mac &&
    a.name === b.name &&
    a.ip === b.ip &&
    a.connection === b.connection &&
    a.connected === b.connected &&
    a.blocked === b.blocked &&
    left.owner === right.owner &&
    left.dbm === right.dbm &&
    left.rate === right.rate &&
    left.subtitle === right.subtitle
  );
}

export function filterCounts(
  entries: readonly ClientEntry[],
  band: string | null,
): Readonly<Record<ClientFilter, number>> {
  const inBand = entries.filter((entry) => band === null || entry.client.band === band);
  const count = (filter: ClientFilter): number =>
    inBand.filter((entry) => MATCHES[filter](entry.client)).length;
  return {
    online: count('online'),
    wifi: count('wifi'),
    wired: count('wired'),
    people: count('people'),
    blocked: count('blocked'),
    all: count('all'),
  };
}

export function bandCounts(clients: readonly NetworkClient[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const client of clients) {
    if (client.connected && client.connection === 'wifi' && client.band !== null) {
      counts.set(client.band, (counts.get(client.band) ?? 0) + 1);
    }
  }
  return counts;
}

function ipOrder(ip: string | null): number {
  if (ip === null) {
    return Number.MAX_SAFE_INTEGER;
  }
  return ip.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

const NO_SIGNAL = Number.POSITIVE_INFINITY;

const ORDER: Readonly<Record<ClientSort, (left: ClientEntry, right: ClientEntry) => number>> = {
  online: (left, right) =>
    Number(right.client.connected) - Number(left.client.connected) ||
    ipOrder(left.client.ip) - ipOrder(right.client.ip),
  name: () => 0,
  traffic: (left, right) =>
    (right.client.trafficBytesPerSecond ?? 0) - (left.client.trafficBytesPerSecond ?? 0),
  signal: (left, right) => (left.dbm ?? NO_SIGNAL) - (right.dbm ?? NO_SIGNAL),
};

function sorted(entries: readonly ClientEntry[], sort: ClientSort): readonly ClientEntry[] {
  return [...entries].sort(
    (left, right) => ORDER[sort](left, right) || compareText(left.client.name, right.client.name),
  );
}

export interface ClientView {
  readonly filter: ClientFilter;
  readonly band: string | null;
  readonly query: string;
  readonly sort: ClientSort;
  readonly offlineOpen: boolean;
}

export type ClientItem =
  | { readonly kind: 'client'; readonly entry: ClientEntry }
  | { readonly kind: 'offline'; readonly count: number; readonly open: boolean };

export function clientKey(item: ClientItem): string {
  return item.kind === 'client' ? item.entry.client.mac : 'offline-toggle';
}

export function sameItem(left: ClientItem, right: ClientItem): boolean {
  if (left.kind === 'offline') {
    return right.kind === 'offline' && left.count === right.count && left.open === right.open;
  }
  return right.kind === 'client' && sameEntry(left.entry, right.entry);
}

function matchesView(entry: ClientEntry, view: ClientView): boolean {
  const needle = view.query.trim().toLowerCase();
  const { client } = entry;
  return (
    MATCHES[view.filter](client) &&
    (view.band === null || client.band === view.band) &&
    (needle === '' ||
      [client.name, client.mac, client.ip ?? ''].some((field) =>
        field.toLowerCase().includes(needle),
      ))
  );
}

function ownerGroups(
  entries: readonly ClientEntry[],
  sort: ClientSort,
): readonly VirtualSection<ClientItem>[] {
  const owned = new Map<string, ClientEntry[]>();
  const others: ClientEntry[] = [];
  for (const entry of entries) {
    if (entry.owner === null) {
      others.push(entry);
    } else {
      appendTo(owned, entry.owner, entry);
    }
  }
  const groups = [...owned.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([title, group]) => ({ title, group }));
  if (others.length > 0) {
    groups.push({
      title: groups.length === 0 ? plural(others.length, 'device') : 'Everyone else',
      group: others,
    });
  }
  return groups.map(({ title, group }) => ({
    key: title,
    title,
    data: sorted(group, sort).map((entry) => ({ kind: 'client' as const, entry })),
  }));
}

function offlineSection(
  offline: readonly ClientEntry[],
  view: ClientView,
): VirtualSection<ClientItem> {
  const open = view.offlineOpen || view.query.trim() !== '';
  return {
    key: 'offline',
    title: `Offline (${String(offline.length)})`,
    data: [
      { kind: 'offline', count: offline.length, open },
      ...(open
        ? sorted(offline, view.sort).map((entry) => ({ kind: 'client' as const, entry }))
        : []),
    ],
  };
}

export function clientSections(
  entries: readonly ClientEntry[],
  view: ClientView,
): readonly VirtualSection<ClientItem>[] {
  const shown = entries.filter((entry) => matchesView(entry, view));
  if (!COLLAPSED_OFFLINE.has(view.filter)) {
    return ownerGroups(shown, view.sort);
  }
  const offline = shown.filter((entry) => !entry.client.connected);
  const groups = ownerGroups(
    shown.filter((entry) => entry.client.connected),
    view.sort,
  );
  return offline.length === 0 ? groups : [...groups, offlineSection(offline, view)];
}

export function initialFilter(
  clients: readonly NetworkClient[],
  filter: string | null,
  mac: string | null,
): ClientFilter {
  if (isClientFilter(filter)) {
    return filter;
  }
  const opened = clients.find((client) => client.mac === mac);
  return opened === undefined || opened.connected ? 'online' : 'all';
}

const NAME_LIMIT = 32;

export function renameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > NAME_LIMIT) {
    return `Use 1 to ${String(NAME_LIMIT)} characters.`;
  }
  return /[<>]/.test(trimmed) ? 'Names can’t contain < or >.' : null;
}
