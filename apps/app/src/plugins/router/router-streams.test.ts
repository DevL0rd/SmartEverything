import {
  ROUTER_INVENTORY,
  ROUTER_LIVE,
  type PluginStreamRow,
  type RouterSnapshot,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { StreamParser } from '../shared/use-plugin-stream';
import { mergeRouterStreams } from './router-data';
import { routerSnapshot } from './overview/snapshot-fixture';

const JSON_VALUE = z.json();

const PHONE = 'aa:bb:cc:dd:ee:00';

function split(snapshot: RouterSnapshot): {
  readonly live: unknown;
  readonly inventory: unknown;
} {
  const { info, radios, clients, people, ...rest } = snapshot;
  return {
    live: {
      ...rest,
      radios: radios.map(({ band, noiseDbm, temperatureCelsius, airtimeBusyPercent }) => ({
        band,
        noiseDbm,
        temperatureCelsius,
        airtimeBusyPercent,
      })),
    },
    inventory: {
      at: snapshot.at,
      info,
      radios: radios.map(
        ({
          noiseDbm: _noise,
          temperatureCelsius: _temperature,
          airtimeBusyPercent: _busy,
          ...radio
        }) => radio,
      ),
      clients,
      people,
    },
  };
}

function radio(airtimeBusyPercent: number): RouterSnapshot['radios'][number] {
  return {
    band: '5 GHz',
    ssid: 'Home',
    enabled: true,
    txPower: 20,
    channel: 36,
    width: '80 MHz',
    noiseDbm: -92,
    temperatureCelsius: 51,
    airtimeBusyPercent,
    dfs: null,
    clients: 3,
  };
}

function row(stream: string, value: unknown, at: string): PluginStreamRow {
  return {
    plugin_id: 'router',
    stream,
    value: JSON_VALUE.parse(JSON.parse(JSON.stringify(value))),
    at,
  };
}

function station(trafficBytesPerSecond: number): RouterSnapshot['stations'][number] {
  return {
    mac: PHONE,
    band: '5 GHz',
    rssiDbm: -50,
    txMbps: 100,
    rxMbps: 100,
    phyMbps: 1200,
    trafficBytesPerSecond,
  };
}

describe('the merged router snapshot', () => {
  it('parses the client list once while the live part ticks every second', () => {
    const inventoryParse = vi.spyOn(ROUTER_INVENTORY, 'safeParse');
    const liveParser = new StreamParser(ROUTER_LIVE);
    const inventoryParser = new StreamParser(ROUTER_INVENTORY);
    const parts = split(routerSnapshot());
    const inventoryRow = row('router.snapshot', parts.inventory, 'a');
    const inventory = inventoryParser.read(inventoryRow);
    const merged = Array.from({ length: 10 }, (_, second) =>
      mergeRouterStreams(
        liveParser.read(row('router.live', parts.live, String(second))),
        inventoryParser.read(inventoryRow),
      ),
    );
    expect(inventoryParse).toHaveBeenCalledTimes(1);
    expect(inventory.state).toBe('ready');
    const clients = merged.map((stream) => (stream.state === 'ready' ? stream.value.clients : []));
    expect(new Set(clients).size).toBe(1);
  });

  it('returns the same stream for the same pair and shows the live traffic on each client', () => {
    const liveParser = new StreamParser(ROUTER_LIVE);
    const inventoryParser = new StreamParser(ROUTER_INVENTORY);
    const parts = split(routerSnapshot({ state: 'online' }, { stations: [station(4000)] }));
    const live = liveParser.read(row('router.live', parts.live, 'b'));
    const inventory = inventoryParser.read(row('router.snapshot', parts.inventory, 'a'));
    const merged = mergeRouterStreams(live, inventory);
    expect(mergeRouterStreams(live, inventory)).toBe(merged);
    if (merged.state !== 'ready') throw new Error('not ready');
    expect(merged.at).toBe('b');
    expect(merged.value.clients.find((client) => client.mac === PHONE)?.trafficBytesPerSecond).toBe(
      4000,
    );
    expect(
      merged.value.clients.filter((client) => client.trafficBytesPerSecond !== null),
    ).toHaveLength(1);
  });

  it('shows the radio telemetry from the live part while the inventory stays parsed once', () => {
    const inventoryParse = vi.spyOn(ROUTER_INVENTORY, 'safeParse');
    inventoryParse.mockClear();
    const liveParser = new StreamParser(ROUTER_LIVE);
    const inventoryParser = new StreamParser(ROUTER_INVENTORY);
    const first = split(routerSnapshot({ state: 'online' }, { radios: [radio(12)] }));
    const later = split(routerSnapshot({ state: 'online' }, { radios: [radio(64)] }));
    const inventoryRow = row('router.snapshot', first.inventory, 'a');
    const readings = [first, later].map((parts, second) => {
      const merged = mergeRouterStreams(
        liveParser.read(row('router.live', parts.live, String(second))),
        inventoryParser.read(inventoryRow),
      );
      if (merged.state !== 'ready') throw new Error('not ready');
      return merged.value.radios;
    });
    expect(inventoryParse).toHaveBeenCalledTimes(1);
    expect(readings.map((radios) => radios[0]?.airtimeBusyPercent)).toEqual([12, 64]);
    expect(readings[1]?.[0]).toEqual(radio(64));
  });

  it('waits until both parts have arrived', () => {
    const liveParser = new StreamParser(ROUTER_LIVE);
    const inventoryParser = new StreamParser(ROUTER_INVENTORY);
    const parts = split(routerSnapshot());
    const live = liveParser.read(row('router.live', parts.live, 'b'));
    expect(mergeRouterStreams(live, inventoryParser.read(undefined)).state).toBe('waiting');
    expect(
      mergeRouterStreams(liveParser.read(undefined), inventoryParser.read(undefined)).state,
    ).toBe('waiting');
    expect(
      mergeRouterStreams(live, inventoryParser.read(row('router.snapshot', { at: 'x' }, 'a')))
        .state,
    ).toBe('invalid');
  });
});
