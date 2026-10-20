import type { RowChange, SignalInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { automationSignals } from '../../src/signals/sources/automation';
import { feedContextOf } from '../../src/signals/sources/feed-context';
import { saveAutomation } from '../support/automation-fixture';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function signalsOf(mode: 'live' | 'dry' | 'simulated'): SignalInput[] {
  const { store } = opened;
  const changes: RowChange[] = [];
  store.feed.subscribe((change) => {
    if (change.table === 'automation_runs') changes.push(change);
  });
  const automation = saveAutomation(store);
  const run = store.automationRunRecords.create({
    automationId: automation.id,
    revision: 1,
    ownerProfileId: null,
    mode,
    planHash: 'a'.repeat(64),
  });
  store.automationRunRecords.update(run.id, { status: 'running' });
  const context = feedContextOf(
    new Date('2026-10-18T10:00:00.000Z'),
    () => 'UTC',
    () => null,
  );
  return changes.flatMap((change) => [...automationSignals(change, context)]);
}

describe('the status signals of automation runs', () => {
  it('follow the status of a live run', () => {
    expect(signalsOf('live').map((signal) => signal.value)).toStrictEqual(['queued', 'running']);
  });

  it('are not sent for a dry run or a simulation', () => {
    expect(signalsOf('dry')).toStrictEqual([]);
    expect(signalsOf('simulated')).toStrictEqual([]);
  });
});
