import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readPluginTool = vi.fn();
vi.mock(import('../use-plugin-tool'), async (importOriginal) => ({
  ...(await importOriginal()),
  readPluginTool,
  usePluginTool: vi.fn(),
}));

import type { SpeedTestPhase } from './router-data';

const { SPEED_TESTS_KEY, settledRun, speedTestsQuery } = await import('./router-data');

const TEST = {
  id: '2f8f2c0e-4f4a-4c37-9d5b-0d8c1e5a7b11',
  at: '2026-10-16T10:00:00.000Z',
  server: 'Local',
  downloadMbps: 500,
  uploadMbps: 50,
  pingMs: 8,
  jitterMs: 1,
  packetLossPercent: 0,
};

beforeEach(() => {
  readPluginTool.mockReset();
  readPluginTool.mockResolvedValue({ tests: [TEST] });
});

const NEWER = {
  ...TEST,
  id: '7a1d6c52-1b0e-4f0a-8f43-2f3d9c9a6e21',
  at: '2026-10-16T10:05:00.000Z',
};

describe('speedTestsQuery', () => {
  it('reads the history once however many components ask', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    await Promise.all([
      client.query(speedTestsQuery()),
      client.query(speedTestsQuery()),
      client.query(speedTestsQuery()),
    ]);
    await client.query(speedTestsQuery());
    expect(readPluginTool).toHaveBeenCalledTimes(1);
  });

  it('keeps the newest list while the next run is in progress', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    expect(await client.query(speedTestsQuery())).toEqual([TEST]);
    readPluginTool.mockResolvedValue({ tests: [NEWER, TEST] });
    await client.invalidateQueries({ queryKey: SPEED_TESTS_KEY });
    expect(await client.query(speedTestsQuery())).toEqual([NEWER, TEST]);
    expect(await client.query(speedTestsQuery())).toEqual([NEWER, TEST]);
    expect(readPluginTool).toHaveBeenCalledTimes(2);
  });

  it('fails when the reply is not a speed test list', async () => {
    readPluginTool.mockResolvedValue({ tests: [{ id: 'x' }] });
    const client = new QueryClient();
    await expect(client.query(speedTestsQuery())).rejects.toThrow();
  });
});

describe('settledRun', () => {
  const row = (phase: SpeedTestPhase) =>
    ({
      state: 'ready',
      at: 'T',
      value: { phase, mbps: 0, pingMs: null, downloadMbps: null, reason: null },
    }) as const;

  it('is null while waiting and while a run is measuring', () => {
    expect(settledRun({ state: 'waiting' })).toBeNull();
    expect(settledRun(row('ping'))).toBeNull();
    expect(settledRun(row('download'))).toBeNull();
  });

  it('names each finished run so the next one refreshes again', () => {
    expect(settledRun(row('done'))).toBe('T:done');
    expect(settledRun(row('failed'))).toBe('T:failed');
  });
});
