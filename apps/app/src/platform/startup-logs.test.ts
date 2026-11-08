import { describe, expect, it, vi } from 'vitest';
import type { RuntimeLogRecord } from '@smarteverything/domain';

const fixture = vi.hoisted(() => ({
  storage: new Map([
    [
      'smarteverything.runtime-log-startup-scope',
      JSON.stringify({ scope: 'paired scope', since: 100 }),
    ],
  ]),
  readExit: vi.fn<(after: number, before: number) => Promise<readonly RuntimeLogRecord[]>>(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string): Promise<string | null> =>
      Promise.resolve(fixture.storage.get(key) ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      fixture.storage.set(key, value);
      return Promise.resolve();
    },
  },
}));

vi.mock('./last-exit', () => ({ readProcessExitLogs: fixture.readExit }));

import { bindStartupLogs, keepStartupLog } from './startup-logs';

describe('startup evidence awaiting authentication', () => {
  it('keeps a boot fault and a prior process crash together in the original outbox', async () => {
    const bootFault = {
      timestamp: '2026-11-05T07:00:02.000Z',
      runtime: 'app',
      platform: 'android',
      scope: 'app.startup',
      level: 'error',
      event: 'startup.failed',
      payload: {},
    } as const;
    fixture.readExit.mockResolvedValue([{ ...bootFault, event: 'process.exited_abnormally' }]);
    const retain = vi.fn(() => Promise.resolve());
    keepStartupLog(bootFault);
    await bindStartupLogs('paired scope', () => true, retain);
    expect(fixture.readExit).toHaveBeenCalledExactlyOnceWith(100, expect.any(Number));
    expect(retain).toHaveBeenCalledExactlyOnceWith([
      bootFault,
      { ...bootFault, event: 'process.exited_abnormally' },
    ]);
    await bindStartupLogs('another hub', () => true, retain);
    expect(retain).toHaveBeenCalledOnce();
  });
});
