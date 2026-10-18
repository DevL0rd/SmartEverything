import { PLUGIN_MANIFEST, type PluginDataPoint } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contributionsOf } from '../../src/plugins/contributions';
import { routerPlugin } from '../../src/plugins/builtin/router';
import { SNAPSHOT_STREAM } from '../../src/plugins/builtin/router/runtime';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const AT = '2026-10-17T10:00:00.000Z';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  vi.useFakeTimers();
  opened = await testStore();
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

function point(index: number): PluginDataPoint {
  return { stream: SNAPSHOT_STREAM, value: { index }, at: AT };
}

describe('live plugin streams', () => {
  it('keeps router frames in memory and writes the newest one only once a minute and on stop', () => {
    const { store } = opened;
    const manifest = PLUGIN_MANIFEST.parse(routerPlugin.manifest);
    store.plugins.create({ manifest, source: 'builtin', location: 'builtin', trusted: true });
    const run = vi.spyOn(store.pluginData, 'publish');
    const contributions = contributionsOf(
      {
        store,
        signals: { emit: vi.fn(), register: vi.fn() },
        inbound: vi.fn(),
        now: () => new Date(AT),
      },
      manifest,
      vi.fn(),
    );
    for (let index = 0; index < 30; index += 1) contributions.sinks.data(point(index));
    expect(run).not.toHaveBeenCalled();
    expect(store.pluginData.history(manifest.id, SNAPSHOT_STREAM, 10)).toEqual([]);
    vi.advanceTimersByTime(60_000);
    expect(store.pluginData.history(manifest.id, SNAPSHOT_STREAM, 10)).toEqual([point(29)]);
    contributions.sinks.data(point(30));
    contributions.stop();
    expect(store.pluginData.history(manifest.id, SNAPSHOT_STREAM, 10)).toEqual([point(30)]);
  });
});
