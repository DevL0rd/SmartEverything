import type { RouterSnapshot } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { tileLine } from './tile-model';

function snapshot(
  connection: RouterSnapshot['connection'],
  wanUp: boolean | null = true,
): RouterSnapshot {
  return {
    at: '2026-10-17T13:45:00.000+00:00',
    connection,
    cadence: 'fast',
    intervalSeconds: 2,
    info: null,
    system: null,
    network: {
      wanUp,
      protocol: null,
      publicIp: null,
      gateway: null,
      dns: [],
      downloadMbps: 182,
      uploadMbps: 21,
      lanDownloadMbps: 0,
      lanUploadMbps: 0,
      latencyMs: null,
      packetLossPercent: null,
      ports: [],
    },
    radios: [],
    stations: [],
    clients: [],
    people: [],
  };
}

describe('tileLine', () => {
  it('shows the live download while the internet is up', () => {
    expect(tileLine(snapshot({ state: 'online' }))).toBe('↓ 182 Mb/s');
  });

  it('does not call a missing reading an outage', () => {
    expect(tileLine({ ...snapshot({ state: 'online' }), network: null })).toBe(
      'Waiting for the router',
    );
  });

  it('names a down connection and each monitoring state in words', () => {
    expect(tileLine(snapshot({ state: 'online' }, false))).toBe('Internet is down');
    expect(tileLine(snapshot({ state: 'paused' }))).toBe('Monitoring paused');
    expect(tileLine(snapshot({ state: 'connecting' }))).toBe('Connecting…');
    expect(tileLine(snapshot({ state: 'not_set_up' }))).toBe('Not set up');
    expect(
      tileLine(
        snapshot({ state: 'unreachable', reason: 'x', since: '2026-10-17T13:00:00.000+00:00' }),
      ),
    ).toBe('Can’t be reached');
  });
});
