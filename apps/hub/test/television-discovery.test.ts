import type { TvInfo } from '@smarteverything/smartthings';
import { describe, expect, it } from 'vitest';
import { everyHost } from '../src/adapters/samsung-tv/candidates';
import { lanSweep, sweepHosts } from '../src/adapters/samsung-tv/lan-sweep';
import { matchScreen, type ScreenDevice } from '../src/adapters/samsung-tv/screen-matching';
import type { LanInterface } from '../src/network/lan';
import { captureLogs, testLogger } from './support/logs';

const LAN: LanInterface = {
  name: 'enp108s0',
  address: '192.168.50.2',
  cidr: '192.168.50.2/24',
  prefix: 24,
};

const BRIDGE: LanInterface = {
  name: 'virbr0',
  address: '192.168.122.1',
  cidr: '192.168.122.1/24',
  prefix: 24,
};

const LIVING_ROOM: TvInfo = {
  on: true,
  powerStateReported: true,
  model: 'QA65S95BAKXXT',
  frame: false,
  name: 'TV',
  wifiMac: '68:FC:CA:C1:52:E0',
};

const MONITOR: TvInfo = {
  on: false,
  powerStateReported: true,
  model: 'LS49CG954SEXXT',
  frame: false,
  name: 'Monitor',
  wifiMac: 'B0:99:D7:D3:18:56',
};

function screen(id: string, model: string, patch: Partial<ScreenDevice> = {}): ScreenDevice {
  return { id, model, online: true, power: true, macs: [], ...patch };
}

const LIVE_TV = screen('live-tv', 'QA65S95BAKXXT');
const STALE_TV = screen('stale-tv', 'QA65S95BAKXXT', { online: false, power: false });
const MONITOR_SCREEN = screen('monitor', 'LS49CG954SEXXT', { power: false });

describe('the hosts the hub sweeps for televisions', () => {
  it('covers its real network but skips its own address, virtual bridges and wide networks', () => {
    const wide: LanInterface = {
      name: 'eth1',
      address: '10.1.2.3',
      cidr: '10.1.2.3/16',
      prefix: 16,
    };
    const hosts = sweepHosts([LAN, BRIDGE, wide]);
    expect(hosts).toHaveLength(253);
    expect(hosts).toContain('192.168.50.1');
    expect(hosts).toContain('192.168.50.61');
    expect(hosts).toContain('192.168.50.254');
    expect(hosts).not.toContain('192.168.50.2');
    expect(hosts).not.toContain('192.168.50.255');
    expect(hosts.some((host) => host.startsWith('192.168.122.'))).toBe(false);
  });

  it('keeps only the hosts whose television port answers', async () => {
    const probed: number[] = [];
    const sweep = lanSweep(
      (host, port) => {
        probed.push(port);
        return Promise.resolve(host === '192.168.50.61' || host === '192.168.50.227');
      },
      () => [LAN],
    );
    expect(await sweep()).toEqual(['192.168.50.61', '192.168.50.227']);
    expect(new Set(probed)).toEqual(new Set([8001]));
  });

  it('joins every way of searching and logs a way that fails', async () => {
    const logs = captureLogs();
    const search = everyHost(
      {
        ssdp: () => Promise.reject(new Error('bind failed')),
        lan: () => Promise.resolve(['192.168.50.61', '192.168.50.61']),
      },
      testLogger('television'),
    );
    expect(await search()).toEqual(['192.168.50.61']);
    expect(logs.events()).toContain('television.search_failed');
  });
});

describe('matching an answering television to its SmartThings device', () => {
  it('picks the only screen of that model', () => {
    expect(matchScreen(MONITOR, [LIVE_TV, MONITOR_SCREEN])).toEqual({
      kind: 'learned',
      deviceId: 'monitor',
      mac: 'b0:99:d7:d3:18:56',
    });
  });

  it('tells two screens of the same model apart by which one is online with the same power', () => {
    expect(matchScreen(LIVING_ROOM, [STALE_TV, LIVE_TV, MONITOR_SCREEN])).toMatchObject({
      kind: 'learned',
      deviceId: 'live-tv',
    });
  });

  it('refuses to guess when both screens of the model agree', () => {
    const twin = screen('twin-tv', 'QA65S95BAKXXT');
    expect(matchScreen(LIVING_ROOM, [twin, LIVE_TV])).toMatchObject({ kind: 'unsure' });
  });

  it('refuses to guess between twins when the screen does not say its power', () => {
    const silent: TvInfo = { ...LIVING_ROOM, powerStateReported: false };
    expect(matchScreen(silent, [STALE_TV, LIVE_TV])).toMatchObject({ kind: 'unsure' });
  });

  it('recognises a screen whose address is already known and never moves it', () => {
    const known = screen('known-tv', 'QA65S95BAKXXT', { macs: ['68:fc:ca:c1:52:e0'] });
    expect(matchScreen(LIVING_ROOM, [LIVE_TV, known])).toMatchObject({
      kind: 'known',
      deviceId: 'known-tv',
    });
  });

  it('leaves a screen with a different address already entered alone', () => {
    const entered = screen('live-tv', 'QA65S95BAKXXT', { macs: ['aa:bb:cc:dd:ee:ff'] });
    expect(matchScreen(LIVING_ROOM, [entered])).toMatchObject({ kind: 'unsure' });
  });
});
