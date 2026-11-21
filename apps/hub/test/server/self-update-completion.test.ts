import { openSeededStore, testStore, type TestStore } from '../support/store';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  HUB_UPDATE_LEDGER_FILE,
  type HubUpdateOrigin,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reconcileHubUpdateNotes } from '../../src/self-update/completion';
import { startHubUpdateCompletion } from '../../src/self-update/completion-extension';
import { hubUpdateStatus, readHubUpdateLedger } from '../../src/self-update/recovery';
import { saveRepairWorkClaim } from '../../src/store/repositories/repair-work-claims';
import { TEST_ENGINE } from '../support/engine';
import { testLogger } from '../support/logs';
import { testStoreHost } from '../support/store-host';

const NOW = '2026-11-05T06:00:00.000Z';
const PRIVATE = '/home/private/release';

let fixture: TestStore;

beforeEach(async () => {
  fixture = await testStore();
});

afterEach(async () => {
  await fixture.close();
});

function origin(profileId = fixture.store.profiles.first().id): HubUpdateOrigin {
  const { id } = fixture.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Updates',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  });
  return { chatId: id, profileId };
}

function release(origin: HubUpdateOrigin, phase: HubUpdateRelease['phase']): HubUpdateRelease {
  return {
    runId: randomUUID(),
    origin,
    phase,
    notes: 'Owner release',
    build: PRIVATE,
    backup: PRIVATE,
    url: 'http://127.0.0.1:7880',
    healthFile: PRIVATE,
    watchdogUnit: 'hub-update-test.service',
    startingSchema: 164,
    changedDatabase: false,
    installs: [PRIVATE],
    checks: [],
    failedChecks: [],
    reason: PRIVATE,
    interrupted: false,
    revision: 2,
    startedAt: NOW,
    updatedAt: NOW,
    finishedAt: phase === 'verifying' ? null : NOW,
  };
}

async function record(...releases: HubUpdateRelease[]): Promise<void> {
  const folder = fixture.layout.system.updates.selfUpdate;
  const target = join(folder, HUB_UPDATE_LEDGER_FILE);
  await mkdir(folder, { recursive: true });
  await writeFile(`${target}.next`, JSON.stringify({ releases }));
  await rename(`${target}.next`, target);
}

function messages(chatId: string): ReturnType<TestStore['store']['assistantChat']['messages']> {
  return fixture.store.assistantChat.messages({ chatId, limit: 20 });
}

function nextNote(): Promise<void> {
  return new Promise<void>((resolve) => {
    const off = fixture.store.feed.subscribe((change) => {
      if (change.table !== 'assistant_messages') return;
      off();
      resolve();
    });
  });
}

async function reopen(): Promise<void> {
  const { directory, layout } = fixture;
  await fixture.store.close();
  const store = await openSeededStore({
    host: testStoreHost(),
    path: join(directory, 'test.db'),
    now: () => new Date(NOW),
    log: testLogger('self-update-completion'),
    systemTimeZone: 'UTC',
    driveFolders: null,
  });
  fixture = {
    directory,
    layout,
    store,
    close: async (): Promise<void> => {
      await store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

it('reconciles a terminal update after startup exactly once, even after note deletion', async () => {
  const target = origin();
  const done = release(target, 'done');
  await record(done, release(target, 'verifying'));
  const running = await startHubUpdateCompletion({
    store: fixture.store,
    layout: fixture.layout,
    live: { announce: vi.fn() },
  });
  await running.stop();
  expect(messages(target.chatId).map(({ role }) => role)).toEqual(['system']);
  expect(messages(target.chatId)[0]?.text).toContain(done.runId);
  expect(JSON.stringify(messages(target.chatId))).not.toContain(PRIVATE);
  fixture.store.assistantChat.removeMessages(messages(target.chatId).map(({ id }) => id));
  await reopen();
  const restarted = await startHubUpdateCompletion({
    store: fixture.store,
    layout: fixture.layout,
    live: { announce: vi.fn() },
  });
  await restarted.stop();
  expect(messages(target.chatId)).toEqual([]);
});

it('announces distinct watchdog status changes to owners and reconciles completion notes', async () => {
  const target = origin();
  const earlier = origin();
  const update = release(target, 'verifying');
  await record(update);
  let receiveChange: () => void = () => undefined;
  const firstChange = new Promise<void>((resolve) => {
    receiveChange = resolve;
  });
  const announce = vi.fn(() => {
    receiveChange();
  });
  const running = await startHubUpdateCompletion({
    store: fixture.store,
    layout: fixture.layout,
    live: { announce },
  });
  try {
    expect(announce).not.toHaveBeenCalled();
    await record({ ...update, phase: 'restarting' });
    await firstChange;
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      { type: 'hub_update_status_changed' },
      'owners',
    );
    await expect(hubUpdateStatus(fixture.layout)).resolves.toMatchObject({
      release: { runId: update.runId, phase: 'restarting' },
    });
    const finished = { ...update, phase: 'reverted', finishedAt: NOW } as const;
    const completion = nextNote();
    await record(finished);
    await completion;
    expect(messages(target.chatId).map(({ role }) => role)).toEqual(['system']);
    expect(messages(target.chatId)[0]?.text).toContain('previous release was restored');
    expect(announce).toHaveBeenCalledTimes(2);

    const olderNote = nextNote();
    await record(release(earlier, 'done'), finished);
    await olderNote;
    expect(announce).toHaveBeenCalledTimes(2);
  } finally {
    await running.stop();
  }
});

it('settles the hub release job when the release finishes after the hub started', async () => {
  const target = origin();
  const update = release(target, 'verifying');
  await record(update);
  const jobs = join(fixture.layout.system.updates.selfUpdate, 'jobs');
  await mkdir(jobs, { recursive: true });
  const file = join(jobs, `${randomUUID()}.json`);
  const running = {
    runId: randomUUID(),
    action: 'hub',
    phase: 'running',
    detail: 'the watchdog is starting',
    result: { runId: update.runId },
  };
  await writeFile(file, JSON.stringify(running));
  const extension = await startHubUpdateCompletion({
    store: fixture.store,
    layout: fixture.layout,
    live: { announce: vi.fn() },
  });
  try {
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ phase: 'running' });
    await record({ ...update, phase: 'done', finishedAt: NOW });
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ phase: 'applied' });
    });
  } finally {
    await extension.stop();
  }
});

it('does not deliver to a member or a chat whose owner does not match the saved binding', async () => {
  const target = origin();
  const member = fixture.store.profiles.create({ name: 'Member' });
  const other = origin(member.id);
  await record(release(other, 'done'), release({ ...target, profileId: member.id }, 'done'));
  await reconcileHubUpdateNotes(fixture.store, await readHubUpdateLedger(fixture.layout));
  expect(messages(target.chatId)).toEqual([]);
  expect(messages(other.chatId)).toEqual([]);
});

it('asks the requesting chat and the hub repair chat once for a decision on a failed release', async () => {
  const target = origin();
  const repair = origin();
  saveRepairWorkClaim(
    fixture.store.settingsKv,
    { component: 'hub.service', ...repair },
    fixture.store.now(),
  );
  const waiting = { ...release(target, 'awaiting_decision'), finishedAt: null };
  await record(waiting);
  const ledger = await readHubUpdateLedger(fixture.layout);
  await reconcileHubUpdateNotes(fixture.store, ledger);
  await reconcileHubUpdateNotes(fixture.store, ledger);
  for (const chat of [target, repair]) {
    expect(messages(chat.chatId)).toHaveLength(1);
    expect(messages(chat.chatId)[0]?.text).toContain('waits for your decision');
    expect(messages(chat.chatId)[0]?.text).toContain(waiting.runId);
  }
  expect(JSON.stringify(messages(target.chatId))).not.toContain(PRIVATE);
  await record({ ...waiting, revision: waiting.revision + 1 });
  await reconcileHubUpdateNotes(fixture.store, await readHubUpdateLedger(fixture.layout));
  expect(messages(target.chatId)).toHaveLength(2);
});
