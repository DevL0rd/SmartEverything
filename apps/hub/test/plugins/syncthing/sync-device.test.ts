import type {
  AdapterSink,
  DiscoveredDevice,
  StateUpdate,
  SyncthingSnapshot,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginMetrics } from '../../../src/plugins/builtin/contract';
import { DeviceMirror } from '../../../src/plugins/builtin/device-mirror';
import { buildSnapshot } from '../../../src/plugins/builtin/syncthing/snapshot';
import { emptySyncData } from '../../../src/plugins/builtin/syncthing/sync-data';
import {
  SYNCTHING_EXTERNAL_ID,
  syncthingMirror,
} from '../../../src/plugins/builtin/syncthing/sync-device';
import { TransferRates } from '../../../src/plugins/builtin/syncthing/transfer-rates';

function snapshotWith(download: number, upload: number, ratesLive = true): SyncthingSnapshot {
  const snapshot = buildSnapshot({
    data: emptySyncData(),
    rates: new TransferRates(),
    ratesLive,
    connection: { state: 'online' },
    overdueHours: 24,
    now: new Date('2026-10-09T00:00:00Z'),
  });
  return {
    ...snapshot,
    summary: {
      ...snapshot.summary,
      downloadBytesPerSecond: download,
      uploadBytesPerSecond: upload,
    },
  };
}

interface Recorded {
  readonly devices: DiscoveredDevice[];
  readonly states: StateUpdate[];
  readonly samples: { readonly key: string; readonly value: number }[];
}

function mirrorWithSink(): {
  readonly mirror: DeviceMirror<SyncthingSnapshot>;
  recorded: Recorded;
} {
  const recorded: Recorded = { devices: [], states: [], samples: [] };
  const metrics: PluginMetrics = {
    push: (_externalId, key, value) => recorded.samples.push({ key, value }),
  };
  const sink: AdapterSink = {
    state: (update) => recorded.states.push(update),
    event: () => undefined,
    online: () => undefined,
    devices: (devices) => recorded.devices.push(...devices),
    failure: () => undefined,
  };
  const mirror = new DeviceMirror(syncthingMirror(metrics));
  mirror.attach(sink);
  return { mirror, recorded };
}

describe('syncthing device mirror', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('describes the sampled byte-rate capabilities', () => {
    const { mirror, recorded } = mirrorWithSink();
    mirror.update(snapshotWith(0, 0));
    const capabilities = recorded.devices[0]?.capabilities ?? [];
    expect(
      capabilities.find((capability) => capability.key === 'sync_download_rate'),
    ).toMatchObject({ access: 'read', value: { kind: 'number', unit: 'B/s' } });
    expect(capabilities.find((capability) => capability.key === 'sync_upload_rate')).toMatchObject({
      access: 'read',
      value: { kind: 'number', unit: 'B/s' },
    });
    expect(recorded.devices[0]?.externalId).toBe(SYNCTHING_EXTERNAL_ID);
  });

  it('samples every rate reading but reports the rate state at most every ten seconds', () => {
    const { mirror, recorded } = mirrorWithSink();
    mirror.update(snapshotWith(1000, 200));
    vi.advanceTimersByTime(2000);
    mirror.update(snapshotWith(3000, 400));
    expect(recorded.samples).toEqual([
      { key: 'sync_download_rate', value: 1000 },
      { key: 'sync_upload_rate', value: 200 },
      { key: 'sync_download_rate', value: 3000 },
      { key: 'sync_upload_rate', value: 400 },
    ]);
    const rateStates = (): number[] =>
      recorded.states
        .filter((state) => state.capability === 'sync_download_rate')
        .map((state) => Number(state.value));
    expect(rateStates()).toEqual([1000]);
    vi.advanceTimersByTime(10_000);
    mirror.update(snapshotWith(5000, 600));
    expect(rateStates()).toEqual([1000, 5000]);
  });

  it('records no rate samples or states while the rates have no baseline', () => {
    const { mirror, recorded } = mirrorWithSink();
    mirror.update(snapshotWith(0, 0, false));
    expect(recorded.samples).toEqual([]);
    expect(recorded.states.map((state) => state.capability)).not.toContain('sync_download_rate');
    mirror.update(snapshotWith(4000, 800));
    expect(recorded.samples).toEqual([
      { key: 'sync_download_rate', value: 4000 },
      { key: 'sync_upload_rate', value: 800 },
    ]);
  });

  it('reports the other readings immediately', () => {
    const { mirror, recorded } = mirrorWithSink();
    mirror.update(snapshotWith(0, 0));
    const keys = recorded.states.map((state) => state.capability);
    expect(keys).toEqual(
      expect.arrayContaining(['sync_state', 'sync_remaining', 'sync_peers_online']),
    );
  });
});
