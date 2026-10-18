import type { RouterSnapshot, SpeedTestResult } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { heroOf, rateParts } from './hero-model';

const NETWORK: NonNullable<RouterSnapshot['network']> = {
  wanUp: true,
  protocol: 'dhcp',
  publicIp: '203.0.113.24',
  gateway: null,
  dns: [],
  downloadMbps: 215,
  uploadMbps: 21.7,
  lanDownloadMbps: 34,
  lanUploadMbps: 12,
  latencyMs: 12,
  packetLossPercent: 0,
  ports: [],
};

function snapshot(
  connection: RouterSnapshot['connection'],
  network: RouterSnapshot['network'] = NETWORK,
): RouterSnapshot {
  return {
    at: '2026-10-17T13:45:00.000+00:00',
    connection,
    cadence: 'fast',
    intervalSeconds: 2,
    info: null,
    system: null,
    network,
    radios: [],
    stations: [],
    clients: [],
  };
}

const LAST: SpeedTestResult = {
  id: '2f8f2c0e-4f4a-4c37-9d5b-0d8c1e5a7b11',
  at: '2026-10-17T10:00:00.000+00:00',
  server: 'Local',
  downloadMbps: 860,
  uploadMbps: 41,
  pingMs: 8,
  jitterMs: 1,
  packetLossPercent: 0,
};

describe('rateParts', () => {
  it('splits a formatted rate into figure and unit', () => {
    expect(rateParts(182)).toEqual({ value: '182', unit: 'Mb/s' });
    expect(rateParts(21.7)).toEqual({ value: '22', unit: 'Mb/s' });
    expect(rateParts(1200)).toEqual({ value: '1.2', unit: 'Gb/s' });
  });
});

describe('heroOf', () => {
  it('says the internet is up with the share of the measured line', () => {
    const hero = heroOf(snapshot({ state: 'online' }), LAST);
    expect(hero.title).toBe('Internet is up');
    expect(hero.tone).toBe('positive');
    expect(hero.ratio).toBeCloseTo(0.25, 2);
    expect(hero.ringNote).toBe('25 % of your 860 Mb/s line');
    expect(hero.canRun).toBe(true);
    expect(hero.facts[0]).toContain('12');
  });

  it('has no ring or note before the first speed test', () => {
    const hero = heroOf(snapshot({ state: 'online' }), null);
    expect(hero.ratio).toBeNull();
    expect(hero.ringNote).toBeUndefined();
  });

  it('shows dashes and cannot run a test while the internet is down', () => {
    const hero = heroOf(snapshot({ state: 'online' }, { ...NETWORK, wanUp: false }), LAST);
    expect(hero.title).toBe('Internet is down');
    expect(hero.tone).toBe('critical');
    expect(hero.figures.map((figure) => figure.value)).toEqual(['—', '—']);
    expect(hero.canRun).toBe(false);
  });

  it('turns every other connection state into one neutral stale hero', () => {
    const states: RouterSnapshot['connection'][] = [
      { state: 'paused' },
      { state: 'connecting' },
      { state: 'unreachable', reason: 'timeout', since: '2026-10-17T13:40:00.000+00:00' },
    ];
    for (const connection of states) {
      const hero = heroOf(snapshot(connection), LAST);
      expect(hero.stale).toBe(true);
      expect(hero.tone).toBe('neutral');
      expect(hero.title).toMatch(/^Last reading /);
      expect(hero.canRun).toBe(false);
    }
  });

  it('names a connecting router with no reading yet', () => {
    expect(heroOf(snapshot({ state: 'connecting' }, null), null).title).toBe('Connecting…');
  });
});
