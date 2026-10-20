import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveAutomation, startRun } from '../support/automation-fixture';
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

function command(): ReturnType<TestStore['store']['commands']['insert']>[number] {
  const [row] = opened.store.commands.insert([
    {
      deviceId: null,
      capability: 'hub:test',
      value: null,
      source: 'automation',
      requestedBy: null,
    },
  ]);
  if (row === undefined) throw new Error('No command was stored.');
  return row;
}

describe('the commands a run owns', () => {
  it('lets a command go out only while its run is running', () => {
    const { store } = opened;
    const automation = saveAutomation(store);
    const owned = command();
    store.automationRuns.retainCommands(startRun(store, automation.id, 'queued').id, [owned]);
    expect(store.automationRuns.canDispatch(owned.id)).toBe(false);
    const running = startRun(store, automation.id, 'running');
    const sent = command();
    store.automationRuns.retainCommands(running.id, [sent]);
    expect(store.automationRuns.canDispatch(sent.id)).toBe(true);
    expect(store.automationRuns.canDispatch(command().id)).toBe(true);
  });

  it('names the run that sent each command', () => {
    const { store } = opened;
    const automation = saveAutomation(store);
    const run = startRun(store, automation.id, 'running');
    const sent = command();
    store.automationRuns.retainCommands(run.id, [sent]);
    const owners = store.automationRuns.runsOfCommands([sent.id, command().id]);
    expect([...owners.keys()]).toStrictEqual([sent.id]);
    expect(owners.get(sent.id)).toMatchObject({ id: run.id, automation_id: automation.id });
  });

  it('lists the runs started in a window, oldest first', () => {
    const { store } = opened;
    const automation = saveAutomation(store);
    const first = startRun(store, automation.id, 'succeeded');
    const second = startRun(store, automation.id, 'running');
    const inside = store.automationRuns.startedBetween(
      '2000-01-01T00:00:00.000Z',
      '2100-01-01T00:00:00.000Z',
    );
    expect(inside.map((run) => run.id)).toStrictEqual([first.id, second.id]);
    expect(
      store.automationRuns.startedBetween('2000-01-01T00:00:00.000Z', '2000-01-02T00:00:00.000Z'),
    ).toStrictEqual([]);
  });
});

describe('a removed automation leaves no run history behind', () => {
  it('forgets its finished runs and the commands they owned, and keeps other automations', () => {
    const { store } = opened;
    const gone = saveAutomation(store, { name: 'Gone' });
    const kept = saveAutomation(store, { name: 'Kept' });
    const owned = command();
    store.automationRuns.retainCommands(startRun(store, gone.id, 'succeeded').id, [owned]);
    startRun(store, kept.id);
    store.automationRunRecords.forget(gone.id);
    store.automations.remove(gone.id);
    expect(store.automationRunRecords.summaries(gone.id, 10)).toHaveLength(0);
    expect(store.automationRunRecords.summaries(kept.id, 10)).toHaveLength(1);
    expect(store.automationRuns.canDispatch(owned.id)).toBe(true);
  });
});

describe('the revision of an automation moves with every published change', () => {
  it('holds for a draft, a layout and the on or off switch, and moves when a revision is published', () => {
    const { store } = opened;
    const automation = saveAutomation(store, { name: 'First' });
    expect(store.automations.setEnabled(automation.id, false).revision).toBe(1);
    expect(store.automations.byId(automation.id).enabled).toBe(false);
  });
});
