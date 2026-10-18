import { TEST_AUTHOR } from '../support/automation-author';
import { AUTOMATION_RUNS_KEPT } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

function automation(name: string): string {
  return opened.store.automations.create({
    name,
    enabled: true,
    definition: { when: [], steps: [{ do: 'wait', ms: 1000 }] },
    origin: null,
    author: TEST_AUTHOR,
  }).id;
}

describe('B11-8 the run history of an automation stays bounded', () => {
  it('keeps the newest runs of each automation and forgets the commands of the rest', () => {
    const { store } = opened;
    const busy = automation('Busy');
    const quiet = automation('Quiet');
    const [command] = store.commands.insert([
      {
        deviceId: null,
        capability: 'hub:test',
        value: null,
        source: 'automation',
        requestedBy: null,
      },
    ]);
    const first = store.automationRuns.create({
      automationId: busy,
      revision: 1,
      ownerProfileId: null,
    });
    if (command === undefined) throw new Error('No command was stored.');
    store.automationRuns.retainCommands(first.id, [command]);
    store.automationRuns.update(first.id, { status: 'succeeded' });
    for (let index = 0; index < AUTOMATION_RUNS_KEPT + 10; index += 1) {
      const run = store.automationRuns.create({
        automationId: busy,
        revision: 1,
        ownerProfileId: null,
      });
      store.automationRuns.update(run.id, { status: 'succeeded' });
    }
    store.automationRuns.create({ automationId: quiet, revision: 1, ownerProfileId: null });
    store.automationRuns.create({ automationId: busy, revision: 1, ownerProfileId: null });
    expect(
      store.automationRuns.list(busy).filter((run) => run.status === 'succeeded'),
    ).toHaveLength(AUTOMATION_RUNS_KEPT);
    expect(store.automationRuns.list(quiet)).toHaveLength(1);
    expect(store.automationRuns.canDispatch(command.id)).toBe(true);
  });

  it('never forgets a run that is still active', () => {
    const { store } = opened;
    const busy = automation('Busy');
    const active = store.automationRuns.create({
      automationId: busy,
      revision: 1,
      ownerProfileId: null,
    });
    for (let index = 0; index < AUTOMATION_RUNS_KEPT + 5; index += 1) {
      const run = store.automationRuns.create({
        automationId: busy,
        revision: 1,
        ownerProfileId: null,
      });
      store.automationRuns.update(run.id, { status: 'succeeded' });
    }
    expect(store.automationRuns.byId(active.id).status).toBe('queued');
  });
});

describe('a removed automation leaves no run history behind', () => {
  it('forgets its finished runs and the commands they owned, and keeps other automations', () => {
    const { store } = opened;
    const gone = automation('Gone');
    const kept = automation('Kept');
    const [command] = store.commands.insert([
      {
        deviceId: null,
        capability: 'hub:test',
        value: null,
        source: 'automation',
        requestedBy: null,
      },
    ]);
    if (command === undefined) throw new Error('No command was stored.');
    const finished = store.automationRuns.create({
      automationId: gone,
      revision: 1,
      ownerProfileId: null,
    });
    store.automationRuns.retainCommands(finished.id, [command]);
    store.automationRuns.update(finished.id, { status: 'succeeded' });
    store.automationRuns.create({ automationId: kept, revision: 1, ownerProfileId: null });
    store.automations.remove(gone);
    expect(store.automationRuns.list(gone)).toHaveLength(0);
    expect(store.automationRuns.list(kept)).toHaveLength(1);
    expect(store.automationRuns.canDispatch(command.id)).toBe(true);
  });
});

describe('the revision of an automation moves with every change a stale editor could overwrite', () => {
  it('moves on a rename and on enabling or disabling, and holds for a save that changes nothing', () => {
    const { store } = opened;
    const id = automation('First');
    const same = store.automations.update(id, { name: 'First', enabled: true });
    expect(same.revision).toBe(1);
    expect(store.automations.update(id, { name: 'Second' }).revision).toBe(2);
    expect(store.automations.update(id, { enabled: false }).revision).toBe(3);
    expect(() => store.automations.update(id, { name: 'Third', expectedRevision: 2 })).toThrow(
      'changed since it was read',
    );
    expect(store.automations.update(id, { name: 'Third', expectedRevision: 3 }).revision).toBe(4);
  });
});
