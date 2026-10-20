import type { PluginSearchEntry, RouterSnapshot } from '@smarteverything/domain';
import { ROUTER_EXTERNAL_ID } from './router-device';

const ROUTER_SECTIONS = {
  internet: 'internet',
  clients: 'clients',
  wifi: 'wifi',
} as const;

type Section = (typeof ROUTER_SECTIONS)[keyof typeof ROUTER_SECTIONS];

function entry(
  id: string,
  title: string,
  section: Section | null,
  extra: Pick<PluginSearchEntry, 'subtitle' | 'keywords'> & {
    readonly query?: Record<string, string>;
  },
): PluginSearchEntry {
  return {
    id,
    title,
    subtitle: extra.subtitle,
    keywords: extra.keywords,
    target: { kind: 'device', externalId: ROUTER_EXTERNAL_ID, section, query: extra.query ?? {} },
  };
}

const PAGE_ENTRIES: readonly PluginSearchEntry[] = [
  entry('router', 'Router', null, {
    subtitle: 'Internet and home network',
    keywords: ['wan', 'internet', 'asus'],
  }),
  entry('router.clients', 'Network devices', ROUTER_SECTIONS.clients, {
    subtitle: 'Router',
    keywords: ['clients', 'who is home', 'block', 'ip'],
  }),
  entry('router.wifi', 'Wi-Fi', ROUTER_SECTIONS.wifi, {
    subtitle: 'Router',
    keywords: ['wireless', 'channel', 'restart wifi', 'ssid'],
  }),
  entry('router.internet', 'Internet', ROUTER_SECTIONS.internet, {
    subtitle: 'Router',
    keywords: ['wan', 'public ip', 'latency', 'packet loss'],
  }),
  entry('router.speed', 'Speed test', ROUTER_SECTIONS.internet, {
    subtitle: 'Router',
    keywords: ['internet speed', 'download', 'upload', 'ping'],
    query: { speedtest: 'open' },
  }),
];

export function routerSearchEntries(
  snapshot: Pick<RouterSnapshot, 'clients' | 'people'>,
): PluginSearchEntry[] {
  return [
    ...PAGE_ENTRIES,
    ...snapshot.clients.map((client) =>
      entry(`router.client.${client.mac}`, client.name, ROUTER_SECTIONS.clients, {
        subtitle: client.ip === null ? 'Network device' : `Network device · ${client.ip}`,
        keywords: [client.mac, ...(client.ip === null ? [] : [client.ip])],
        query: { mac: client.mac },
      }),
    ),
    ...snapshot.people.map((person) =>
      entry(`router.person.${person.id}`, person.name, ROUTER_SECTIONS.clients, {
        subtitle: person.home ? 'Person · home' : 'Person · away',
        keywords: ['who is home', 'presence', 'arrived', 'left', 'person', 'family'],
        query: { filter: 'people' },
      }),
    ),
  ];
}

export function searchSignature(snapshot: Pick<RouterSnapshot, 'clients' | 'people'>): string {
  return [
    ...snapshot.clients.map((client) => `${client.mac}|${client.name}|${client.ip ?? ''}`),
    ...snapshot.people.map((person) => `${person.id}|${person.name}|${String(person.home)}`),
  ].join('\n');
}
