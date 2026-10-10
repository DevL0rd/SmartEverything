import type { NetworkClient, RouterSnapshot } from '@smarteverything/domain';

export const CLIENT_FILTERS = ['online', 'wifi', 'wired', 'blocked', 'all'] as const;

export type ClientFilter = (typeof CLIENT_FILTERS)[number];

export const FILTER_LABEL: Readonly<Record<ClientFilter, string>> = {
  online: 'Online',
  wifi: 'Wi-Fi',
  wired: 'Wired',
  blocked: 'Blocked',
  all: 'All',
};

const MATCHES: Readonly<Record<ClientFilter, (client: NetworkClient) => boolean>> = {
  online: (client) => client.connected,
  wifi: (client) => client.connected && client.connection === 'wifi',
  wired: (client) => client.connected && client.connection === 'wired',
  blocked: (client) => client.blocked,
  all: () => true,
};

function ipOrder(ip: string | null): number {
  if (ip === null) {
    return Number.MAX_SAFE_INTEGER;
  }
  return ip.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

export function visibleClients(
  clients: readonly NetworkClient[],
  filter: ClientFilter,
  query: string,
): NetworkClient[] {
  const needle = query.trim().toLowerCase();
  return clients
    .filter(MATCHES[filter])
    .filter(
      (client) =>
        needle.length === 0 ||
        [client.name, client.mac, client.ip ?? ''].some((field) =>
          field.toLowerCase().includes(needle),
        ),
    )
    .sort(
      (left, right) =>
        Number(right.connected) - Number(left.connected) ||
        ipOrder(left.ip) - ipOrder(right.ip) ||
        left.name.localeCompare(right.name),
    );
}

export function connectionText(client: NetworkClient): string {
  if (!client.connected) {
    return 'Offline';
  }
  if (client.connection === 'wired') {
    return 'Wired';
  }
  return client.band === null ? 'Wi-Fi' : `Wi-Fi ${client.band}`;
}

export function signalOf(snapshot: RouterSnapshot, mac: string): number | null {
  return snapshot.stations.find((station) => station.mac === mac)?.rssiDbm ?? null;
}
