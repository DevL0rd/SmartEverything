import { describe, expect, it } from 'vitest';
import { ROUTER_SNAPSHOT, type NetworkClient, type RouterSnapshot } from '@smarteverything/domain';
import {
  bandCounts,
  clientEntries,
  clientSections,
  connectionText,
  filterCounts,
  initialFilter,
  renameProblem,
  sameEntry,
  signalOf,
  type ClientEntry,
  type ClientItem,
  type ClientView,
} from './client-model';
import { airtimeOf } from './clients/airtime';
import { clientGlyph } from './clients/client-glyph';

function client(change: Partial<NetworkClient>): NetworkClient {
  return {
    mac: 'aa:bb:cc:00:00:01',
    name: 'Laptop',
    ip: '192.168.1.20',
    connection: 'wifi',
    band: null,
    connected: true,
    blocked: false,
    trafficBytesPerSecond: null,
    profileId: null,
    firstSeen: null,
    lastSeen: null,
    ...change,
  };
}

function snapshotOf(
  clients: readonly NetworkClient[],
  state: 'online' | 'paused' = 'online',
): RouterSnapshot {
  return ROUTER_SNAPSHOT.parse({
    at: '2026-10-16T10:00:00.000Z',
    connection: { state },
    cadence: 'fast',
    intervalSeconds: null,
    info: null,
    system: null,
    network: null,
    radios: [],
    stations: [
      {
        mac: 'aa:bb:cc:00:00:01',
        band: '5 GHz',
        rssiDbm: -55,
        txMbps: 1,
        rxMbps: 1,
        phyMbps: 1,
        trafficBytesPerSecond: 0,
      },
      {
        mac: 'aa:bb:cc:00:00:02',
        band: '2.4 GHz',
        rssiDbm: null,
        txMbps: 1,
        rxMbps: 1,
        phyMbps: 1,
        trafficBytesPerSecond: 0,
      },
      {
        mac: 'aa:bb:cc:00:00:06',
        band: '2.4 GHz',
        rssiDbm: -80,
        txMbps: 1,
        rxMbps: 1,
        phyMbps: 1,
        trafficBytesPerSecond: 0,
      },
    ],
    clients,
  });
}

const DANA = '5b1c9d52-0a4e-4a54-9a56-0d8d9d6b0f01';
const OWNERS: ReadonlyMap<string, string> = new Map([[DANA, 'Dana']]);
const NOW = Date.parse('2026-10-16T10:00:00.000Z');

const CLIENTS: readonly NetworkClient[] = [
  client({ mac: 'aa:bb:cc:00:00:01', name: 'Laptop', ip: '192.168.1.20', band: '5 GHz' }),
  client({ mac: 'aa:bb:cc:00:00:02', name: 'Desktop', ip: '192.168.1.3', connection: 'wired' }),
  client({
    mac: 'aa:bb:cc:00:00:03',
    name: 'Old phone',
    ip: '192.168.1.9',
    connected: false,
    lastSeen: '2026-10-16T09:05:00.000Z',
  }),
  client({ mac: 'aa:bb:cc:00:00:04', name: 'Camera', ip: '192.168.1.100', blocked: true }),
  client({ mac: 'aa:bb:cc:00:00:05', name: 'Alarm', ip: null, connection: 'wired' }),
  client({
    mac: 'aa:bb:cc:00:00:06',
    name: 'Danas phone',
    ip: '192.168.1.40',
    band: '2.4 GHz',
    profileId: DANA,
    trafficBytesPerSecond: 1_200_000,
  }),
];

const VIEW: ClientView = {
  filter: 'all',
  band: null,
  query: '',
  sort: 'online',
  offlineOpen: false,
};

function entriesOf(clients: readonly NetworkClient[] = CLIENTS): readonly ClientEntry[] {
  return clientEntries(snapshotOf(clients), OWNERS, NOW);
}

function names(items: readonly ClientItem[]): string[] {
  return items.map((item) => (item.kind === 'client' ? item.entry.client.name : 'toggle'));
}

function layout(view: Partial<ClientView> = {}): Record<string, string[]> {
  return Object.fromEntries(
    clientSections(entriesOf(), { ...VIEW, ...view }).map((section) => [
      section.title,
      names(section.data),
    ]),
  );
}

describe('filterCounts', () => {
  it('counts Wi-Fi and wired among online devices only so they add up to Online', () => {
    const counts = filterCounts(entriesOf(), null);
    expect(counts.online).toBe(5);
    expect(counts.wifi + counts.wired).toBe(counts.online);
    expect(counts.all).toBe(6);
    expect(counts.blocked).toBe(1);
    expect(counts.people).toBe(1);
  });

  it('counts inside one band when a band is chosen', () => {
    const counts = filterCounts(entriesOf(), '5 GHz');
    expect(counts).toMatchObject({ all: 1, wifi: 1, wired: 0, online: 1 });
  });
});

describe('bandCounts', () => {
  it('counts online Wi-Fi devices per band so the bands add up to the Wi-Fi chip', () => {
    const banded = CLIENTS.map((item) =>
      item.connection === 'wifi' && item.band === null ? { ...item, band: '5 GHz' } : item,
    );
    const bands = bandCounts(banded);
    expect(bands.get('5 GHz')).toBe(2);
    expect(bands.get('2.4 GHz')).toBe(1);
    expect([...bands.values()].reduce((total, value) => total + value, 0)).toBe(
      filterCounts(entriesOf(banded), null).wifi,
    );
  });

  it('ignores offline devices', () => {
    expect(bandCounts([client({ band: '5 GHz', connected: false })]).size).toBe(0);
  });
});

describe('clientSections', () => {
  it('groups people first, then everyone else, online first then by address', () => {
    expect(layout({ filter: 'online' })).toEqual({
      Dana: ['Danas phone'],
      'Everyone else': ['Desktop', 'Laptop', 'Camera', 'Alarm'],
    });
  });

  it('titles a list without people by its device count', () => {
    const sections = clientSections(entriesOf(CLIENTS.filter((item) => item.profileId === null)), {
      ...VIEW,
      filter: 'online',
    });
    expect(sections.map((section) => section.title)).toEqual(['4 devices']);
  });

  it('keeps offline devices behind one toggle until it is opened', () => {
    expect(layout()['Offline (1)']).toEqual(['toggle']);
    expect(layout({ offlineOpen: true })['Offline (1)']).toEqual(['toggle', 'Old phone']);
  });

  it('opens the offline group while searching so a match is never hidden', () => {
    expect(layout({ query: 'old' })['Offline (1)']).toEqual(['toggle', 'Old phone']);
  });

  it('filters to Wi-Fi, wired, blocked and people devices', () => {
    expect(Object.values(layout({ filter: 'wired' })).flat()).toEqual(['Desktop', 'Alarm']);
    expect(Object.values(layout({ filter: 'blocked' })).flat()).toEqual(['Camera']);
    expect(Object.values(layout({ filter: 'people' })).flat()).toEqual(['Danas phone']);
    expect(Object.values(layout({ filter: 'wifi' })).flat()).not.toContain('Old phone');
  });

  it('narrows to a band', () => {
    expect(Object.values(layout({ filter: 'wifi', band: '5 GHz' })).flat()).toEqual(['Laptop']);
  });

  it('searches the name, the hardware address and the address, ignoring case and spaces', () => {
    expect(Object.values(layout({ query: '  lap ' })).flat()).toEqual(['Laptop']);
    expect(Object.values(layout({ query: 'AA:BB:CC:00:00:04' })).flat()).toEqual(['Camera']);
    expect(Object.values(layout({ query: '1.100' })).flat()).toEqual(['Camera']);
    expect(layout({ query: 'nothing like this' })).toEqual({});
  });

  it('sorts by name, traffic and weakest signal inside each group', () => {
    const flat = (sort: ClientView['sort']): string[] =>
      layout({ filter: 'online', sort })['Everyone else'] ?? [];
    expect(flat('name')).toEqual(['Alarm', 'Camera', 'Desktop', 'Laptop']);
    expect(flat('signal')).toEqual(['Laptop', 'Alarm', 'Camera', 'Desktop']);
    expect(flat('traffic')[0]).toBe('Alarm');
  });
});

describe('clientEntries', () => {
  it('shows live rate and signal only while the router is reachable', () => {
    const live = clientEntries(snapshotOf(CLIENTS), OWNERS, NOW);
    const paused = clientEntries(snapshotOf(CLIENTS, 'paused'), OWNERS, NOW);
    const danas = (list: readonly ClientEntry[]): ClientEntry | undefined =>
      list.find((entry) => entry.client.name === 'Danas phone');
    expect(danas(live)).toMatchObject({ rate: '1.2 MB/s', dbm: -80, owner: 'Dana' });
    expect(danas(paused)).toMatchObject({ rate: null, dbm: null });
  });

  it('writes the connection and address, or when an offline device was last seen', () => {
    const subtitle = (name: string): string | undefined =>
      entriesOf().find((entry) => entry.client.name === name)?.subtitle;
    expect(subtitle('Laptop')).toBe('Wi-Fi 5 GHz · 192.168.1.20');
    expect(subtitle('Alarm')).toBe('Wired');
    expect(subtitle('Camera')).toBe('Wi-Fi · 192.168.1.100');
    expect(subtitle('Old phone')).toMatch(/^Last seen today /);
  });

  it('treats a new rate as a changed row and an identical one as the same row', () => {
    const [first] = entriesOf();
    const [again] = entriesOf();
    expect(first).toBeDefined();
    expect(again).toBeDefined();
    if (first === undefined || again === undefined) {
      return;
    }
    expect(sameEntry(first, again)).toBe(true);
    expect(sameEntry(first, { ...again, rate: '3 kB/s' })).toBe(false);
  });
});

describe('initialFilter', () => {
  it('uses the filter from the link, and All for an offline device opened by address', () => {
    expect(initialFilter(CLIENTS, 'people', null)).toBe('people');
    expect(initialFilter(CLIENTS, 'nonsense', null)).toBe('online');
    expect(initialFilter(CLIENTS, null, 'aa:bb:cc:00:00:03')).toBe('all');
    expect(initialFilter(CLIENTS, null, 'aa:bb:cc:00:00:01')).toBe('online');
  });
});

describe('connectionText', () => {
  it('says offline first, then wired, then the Wi-Fi band when known', () => {
    expect(connectionText(client({ connected: false, connection: 'wired' }))).toBe('Offline');
    expect(connectionText(client({ connection: 'wired' }))).toBe('Wired');
    expect(connectionText(client({ band: '5 GHz' }))).toBe('Wi-Fi 5 GHz');
    expect(connectionText(client({ band: null }))).toBe('Wi-Fi');
  });
});

describe('signalOf', () => {
  it('gives the signal strength of a station and nothing for an unknown or silent one', () => {
    const snapshot = snapshotOf([]);
    expect(signalOf(snapshot, 'aa:bb:cc:00:00:01')).toBe(-55);
    expect(signalOf(snapshot, 'aa:bb:cc:00:00:02')).toBeNull();
    expect(signalOf(snapshot, 'aa:bb:cc:00:00:99')).toBeNull();
  });
});

describe('renameProblem', () => {
  it('accepts 1 to 32 characters without angle brackets and says what is wrong otherwise', () => {
    expect(renameProblem('Dana’s phone')).toBeNull();
    expect(renameProblem('   ')).toBe('Use 1 to 32 characters.');
    expect(renameProblem('x'.repeat(33))).toBe('Use 1 to 32 characters.');
    expect(renameProblem('x'.repeat(32))).toBeNull();
    expect(renameProblem('Dana <phone>')).toBe('Names can’t contain < or >.');
  });
});

describe('clientGlyph', () => {
  it('picks a glyph from words in the name, else from how the device connects', () => {
    const glyph = (name: string, connection: 'wifi' | 'wired'): string =>
      clientGlyph({ name, connection });
    expect(glyph('Living room TV', 'wired')).toBe('tv');
    expect(glyph('Kids’ Switch', 'wifi')).toBe('gamepad');
    expect(glyph('Kitchen speaker', 'wifi')).toBe('speaker');
    expect(glyph('Front doorbell', 'wifi')).toBe('camera');
    expect(glyph('Work MacBook', 'wifi')).toBe('monitor');
    expect(glyph('Dana’s iPhone', 'wifi')).toBe('smartphone');
    expect(glyph('NAS', 'wired')).toBe('monitor');
  });

  it('does not take part of a word for a hint', () => {
    expect(clientGlyph({ name: 'Mattress', connection: 'wifi' })).toBe('smartphone');
  });
});

describe('airtimeOf', () => {
  it('turns warning above 60 percent and critical above 85 percent, with a word each', () => {
    expect(airtimeOf(12)).toEqual({ tone: 'info', word: 'Clear' });
    expect(airtimeOf(60)).toEqual({ tone: 'info', word: 'Clear' });
    expect(airtimeOf(61)).toEqual({ tone: 'warning', word: 'Busy' });
    expect(airtimeOf(86)).toEqual({ tone: 'critical', word: 'Very busy' });
  });
});
