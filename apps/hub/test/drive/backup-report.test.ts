import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { hashClientToken, type ClientRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureManagedRoots } from '../../src/drive/managed-roots';
import { systemProbe } from '../../src/drive/volumes';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import type { Caller } from '../../src/server/auth';
import { driveRoutes } from '../../src/server/handlers/drive';
import { createDrive, type DriveRuntime } from '../../src/server/handlers/drive-wiring';
import { MediaLinks } from '../../src/server/media-links';
import { Operations } from '../../src/server/operations';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const log = testLogger('drive-backup');
const REPORT = { reporter: 'borg', bytes: 4096, ok: true };

let opened: TestStore;
let second: DatabaseSync;
let runtime: DriveRuntime;
let operations: Operations;
let ownerId = '';
let memberId = '';

function mcpCaller(
  profileId: string,
  role: ClientRow['role'],
  mcpOrigin: 'personal' | 'oauth',
): Caller {
  const client = opened.store.clients.create(
    {
      name: `Agent ${role}`,
      platform: 'desktop',
      role,
      tokenHash: hashClientToken(`set_${randomBytes(32).toString('hex')}`),
      profileId,
    },
    false,
  );
  return { kind: 'client', client, profileId, mcpOrigin };
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore(() => NOW);
  const { store } = opened;
  second = new DatabaseSync(join(opened.directory, 'test.db'));
  ownerId = store.profiles.first().id;
  memberId = store.profiles.create({ name: 'Sam' }).id;
  runtime = createDrive({
    store,
    parts: {
      context: new StoreContext(new Sql(second), new ChangeFeed(log), () => NOW),
      database: second,
      conflicts: {
        insert: (): void => undefined,
        find: (): undefined => undefined,
        resolve: (): never => {
          throw new Error('no conflicts in this rig');
        },
      },
      listings: {
        shares: () => ({ items: [], next: null }),
        duplicates: () => ({ items: [], next: null }),
        conflicts: () => ({ items: [], next: null }),
      },
      removeLocationOutside: () => true,
      notifyOwner: (): void => undefined,
    },
    layout: opened.layout,
    installDirectory: join(opened.directory, 'install'),
    localUrl: () => 'http://hub.local:8080',
    links: new MediaLinks(() => NOW),
    nodes: new ComputerNodeAccess(store, () => NOW),
    probe: systemProbe,
    now: () => NOW,
    log,
    watchSettleMs: 10,
    scannerScript: join(opened.directory, 'unused-scanner.mjs'),
    hasherScript: join(opened.directory, 'unused-hasher.mjs'),
  });
  await ensureManagedRoots(store, opened.layout, store.profiles.list());
  operations = new Operations(log, store);
  operations.attach(driveRoutes(store, runtime.services));
});

afterEach(async () => {
  await runtime.queue.stop();
  second.close();
  await opened.close();
});

describe('reporting a backup through an MCP access token', () => {
  it.each(['oauth', 'personal'] as const)(
    'reaches reportBackup with the owner’s %s token and marks every root',
    async (origin) => {
      const owner = mcpCaller(ownerId, 'owner', origin);
      await expect(operations.run('reportBackup', owner, { body: REPORT })).resolves.toMatchObject({
        reporter: 'borg',
        bytes: 4096,
        ok: true,
      });
      await expect(operations.run('readBackupStatus', owner, {})).resolves.toMatchObject({
        last: { reporter: 'borg' },
        lastOkAt: NOW.toISOString(),
      });
      const roots = opened.store.driveRoots.list();
      expect(roots.length).toBeGreaterThan(0);
      expect(roots.every((root) => root.health.lastBackupAt === NOW.toISOString())).toBe(true);
    },
  );

  it('refuses a member’s MCP token and records nothing', () => {
    const member = mcpCaller(memberId, 'member', 'oauth');
    expect(() => operations.run('reportBackup', member, { body: REPORT })).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(() => operations.run('readBackupStatus', member, {})).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(opened.store.driveBackups.last()).toBeNull();
    expect(opened.store.driveRoots.list().every((root) => root.health.lastBackupAt === null)).toBe(
      true,
    );
  });

  it('keeps a failed report from moving the last successful backup', async () => {
    const owner = mcpCaller(ownerId, 'owner', 'oauth');
    await operations.run('reportBackup', owner, { body: REPORT });
    await operations.run('reportBackup', owner, {
      body: { reporter: 'borg', bytes: 0, ok: false },
    });
    await expect(operations.run('readBackupStatus', owner, {})).resolves.toMatchObject({
      last: { ok: false },
      lastOkAt: NOW.toISOString(),
    });
  });
});
