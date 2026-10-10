import type { ResponderAppStatus } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppsMonitor } from '../../src/assistant/apps-monitor';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const MISSING: ResponderAppStatus = {
  app: 'codex',
  state: 'not_installed',
  detail: 'Install Codex, sign in, then connect.',
  token_id: null,
};

const INSTALLED: ResponderAppStatus = {
  app: 'codex',
  state: 'not_connected',
  detail: null,
  token_id: null,
};

let logs: CapturedLogs;
let statuses: readonly ResponderAppStatus[];
let next: readonly ResponderAppStatus[];
let checks: number;
let changes: number;
let release: () => void;
let monitor: AppsMonitor;

async function settled(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  logs = captureLogs();
  statuses = [];
  next = [MISSING];
  checks = 0;
  changes = 0;
  release = (): void => undefined;
  monitor = new AppsMonitor({
    apps: {
      get statuses(): readonly ResponderAppStatus[] {
        return statuses;
      },
      refresh: async (): Promise<readonly ResponderAppStatus[]> => {
        checks += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        statuses = next;
        return statuses;
      },
    },
    changed: (): void => {
      changes += 1;
    },
    log: testLogger('assistant'),
  });
});

afterEach(() => {
  monitor.stop();
});

describe('the apps monitor', () => {
  it('announces only when the result changes', async () => {
    monitor.recheck();
    release();
    await settled();
    expect(changes).toBe(1);
    monitor.recheck();
    release();
    await settled();
    expect(changes).toBe(1);
    next = [INSTALLED];
    monitor.recheck();
    release();
    await settled();
    expect(changes).toBe(2);
  });

  it('folds rechecks that arrive during a check into one more check', async () => {
    monitor.recheck();
    monitor.recheck();
    monitor.recheck();
    expect(checks).toBe(1);
    release();
    await settled();
    expect(checks).toBe(2);
    release();
    await settled();
    expect(checks).toBe(2);
  });

  it('logs a failed check and keeps going', async () => {
    const failing = new AppsMonitor({
      apps: {
        statuses: [],
        refresh: (): Promise<readonly ResponderAppStatus[]> =>
          Promise.reject(new Error('codex crashed')),
      },
      changed: (): void => undefined,
      log: testLogger('assistant'),
    });
    failing.recheck();
    await settled();
    expect(logs.events()).toContain('assistant.apps_unreadable');
  });
});
