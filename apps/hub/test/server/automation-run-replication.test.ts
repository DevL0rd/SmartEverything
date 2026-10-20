import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS,
  AUTOMATION_RUN_SUMMARY,
  ROW_CHANGE,
  RUN_RECORD_ONLY_FIELDS,
  type RowChange,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { node, programOf, saveAutomation, startRun, trigger } from '../support/automation-fixture';
import { useBootedServer } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call } from '../support/server';
import { testStore, type TestStore } from '../support/store';
import { until } from '../support/wait';

const SUMMARY_FIELDS = Object.keys(AUTOMATION_RUN_SUMMARY.shape).sort();
const SECRET = 'parked-run-secret-value';

describe('a parked run in the store change stream', () => {
  let opened: TestStore;

  beforeEach(async () => {
    captureLogs();
    opened = await testStore();
  });

  afterEach(async () => {
    await opened.close();
  });

  it('reaches subscribers as its summary without the parked state', () => {
    const { store } = opened;
    const changes: RowChange[] = [];
    store.feed.subscribe((change) => {
      if (change.table === 'automation_runs') changes.push(change);
    });
    const automation = saveAutomation(store);
    const run = startRun(store, automation.id, 'running');
    store.automationRunRecords.park(run.id, {
      state: { marker: SECRET },
      wakeAt: '2026-10-18T10:00:00.000Z',
      waitingOn: { kind: 'duration', note: SECRET },
      activePaths: ['a'],
    });
    expect(changes.map((change) => change.operation)).toStrictEqual(['INSERT', 'UPDATE', 'UPDATE']);
    for (const change of changes) {
      expect(JSON.stringify(ROW_CHANGE.parse(change))).not.toContain(SECRET);
      expect(Object.keys(change.record ?? {}).sort()).toStrictEqual(SUMMARY_FIELDS);
      for (const field of RUN_RECORD_ONLY_FIELDS) expect(change.record).not.toHaveProperty(field);
    }
    const [summary] = store.automationRunRecords.summaries(automation.id, 5);
    expect(summary?.status).toBe('waiting');
    expect(JSON.stringify(summary)).not.toContain(SECRET);
  });
});

describe('a parked run in a snapshot', () => {
  const suite = useBootedServer({ linked: false });

  it('is listed as its summary without the parked state', async () => {
    const { base, owner } = suite.current;
    const created = API_ENDPOINTS.createAutomationProgram.response.parse(
      (
        await call(base, owner, {
          method: 'POST',
          path: '/api/automation-programs',
          body: {
            name: 'Waits',
            enabled: true,
            definition: programOf(
              [trigger('trigger.interval', { every: 604_800_000 })],
              [node('flow.wait', { duration: 3_600_000 })],
            ),
          },
        })
      ).body,
    );
    expect(created.id).not.toBeNull();
    const started = await call(base, owner, {
      method: 'POST',
      path: '/api/automation-runs',
      body: { automationId: created.id ?? randomUUID() },
    });
    expect(started.status).toBe(200);
    let rows: readonly Record<string, unknown>[] = [];
    await until(async () => {
      const snapshot = await call(base, owner, { method: 'GET', path: '/api/snapshot' });
      const tables = API_ENDPOINTS.readSnapshot.response.parse(snapshot.body).tables;
      rows = tables.automation_runs ?? [];
      return rows.some((row) => row['status'] === 'waiting');
    }, 'the run to park');
    for (const row of rows) {
      expect(Object.keys(row).sort()).toStrictEqual(SUMMARY_FIELDS);
    }
  });
});
