import { chmodSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  HUB_HEALTHY,
  HUB_STARTUP_DEADLINE_MS,
  HUB_UNIT,
  HUB_UPDATE_BOOT_RECEIPT_FILE,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { serviceIdentity } from '../self-update-service-identity.ts';
import { handle } from '../self-update-watchdog.ts';
import { AT, OLD, NEW, EXPECTED, paths, write, world } from './self-update-watchdog-fixture.ts';

describe('the hub update watchdog', { timeout: 60_000 }, () => {
  it('keeps a release that passes every health check and writes the healthy marker', async () => {
    const test = world({ phase: 'built', up: true });
    const release = await handle(test.flow);
    expect(release.phase).toBe('done');
    expect(readFileSync(paths().health, 'utf8')).toBe(`${HUB_HEALTHY}\n`);
    expect(test.service()).toBe(NEW);
    expect(test.actions).toEqual([`stop ${HUB_UNIT}`, `start ${HUB_UNIT}`]);
    expect(release.finishedAt).not.toBeNull();
    expect(test.ledger()?.backup).toBe(paths().backup);
    expect(existsSync(paths().backup)).toBe(false);
  });

  it('refuses a modified staged artifact before stopping the hub', async () => {
    const test = world({ phase: 'built', up: true });
    const release = await handle({
      ...test.flow,
      options: { ...test.flow.options, buildIdentity: 'a'.repeat(64) },
      storage: { ...test.flow.storage, treeIdentity: () => 'b'.repeat(64) },
    });
    expect(release.phase).toBe('failed');
    expect(release.reason).toBe('The staged service changed after verification.');
    expect(test.actions).toEqual([]);
    expect(test.service()).toBe(OLD);
  });

  it('refuses a changed executable mode before stopping the hub', async () => {
    const test = world({ phase: 'built', up: true });
    const { build } = paths();
    const entry = join(build, 'service.mjs');
    chmodSync(entry, 0o755);
    const buildIdentity = serviceIdentity(build);
    chmodSync(entry, 0o644);

    const release = await handle({
      ...test.flow,
      options: { ...test.flow.options, buildIdentity },
      storage: { ...test.flow.storage, treeIdentity: serviceIdentity },
    });
    expect(release.phase).toBe('failed');
    expect(test.actions).toEqual([]);
  });

  it('ignores the boot receipt only when comparing payloads', () => {
    world({ phase: 'built', up: true });
    const { build } = paths();
    const before = serviceIdentity(build);
    write(join(build, HUB_UPDATE_BOOT_RECEIPT_FILE), '{"runId":"fixture"}');
    expect(serviceIdentity(build, false)).toBe(before);
    expect(serviceIdentity(build)).not.toBe(before);
  });

  it('identifies internal relative links and refuses links to external files', () => {
    world({ phase: 'built', up: true });
    const { build, database } = paths();
    symlinkSync('service.mjs', join(build, 'internal'));
    expect(serviceIdentity(build)).toMatch(/^[a-f0-9]{64}$/u);
    symlinkSync(database, join(build, 'external'));
    expect(() => serviceIdentity(build)).toThrow(/outside its movable tree/u);
  });

  it('reverts to the backup service when the new release fails its checks', async () => {
    const test = world({ phase: 'built', up: true, devices: null });
    const release = await handle(test.flow);
    expect(release.phase).toBe('reverted');
    expect(test.service()).toBe(OLD);
    expect(test.database()).toBe(EXPECTED);
    expect(existsSync(paths().health)).toBe(false);
    expect(test.actions).toEqual([
      `stop ${HUB_UNIT}`,
      `start ${HUB_UNIT}`,
      `stop ${HUB_UNIT}`,
      `start ${HUB_UNIT}`,
    ]);
  });

  it('captures writes after quiescing the hub and preserves them on migration rollback', async () => {
    const test = world({ phase: 'built', up: true, migrates: 9 });
    const { database, backup } = paths();
    const acknowledged = `${EXPECTED}\nlast acknowledged write`;
    const act = test.flow.units.act;
    const release = await handle({
      ...test.flow,
      units: {
        ...test.flow.units,
        act: (verb: Parameters<typeof act>[0], unit: string): void => {
          if (verb === 'stop' && unit === HUB_UNIT && test.service() === OLD)
            write(database, acknowledged);
          act(verb, unit);
        },
      },
    });
    expect(release.phase).toBe('reverted');
    expect(existsSync(backup)).toBe(false);
    expect(test.database()).toBe(acknowledged);
  });

  it('preserves writes on same-schema rollback without replacing the live database', async () => {
    const test = world({ phase: 'built', up: true, devices: null });
    const acknowledged = `${EXPECTED}\nwrite acknowledged by the new hub`;
    const release = await handle({
      ...test.flow,
      health: {
        ...test.flow.health,
        devices: async (): Promise<number | null> => {
          if (test.service() === NEW) write(paths().database, acknowledged);
          return await test.flow.health.devices();
        },
      },
    });
    expect(release.phase).toBe('reverted');
    expect(test.database()).toBe(acknowledged);
  });

  it('reverts a release even if an automatically restarted service is active again', async () => {
    const test = world({ phase: 'built', up: true });
    const release = await handle({
      ...test.flow,
      units: {
        ...test.flow.units,
        restarts: (unit) => (unit === HUB_UNIT && test.service() === NEW ? 1 : 0),
      },
    });
    expect(release.phase).toBe('reverted');
    expect(release.failedChecks).toContainEqual(expect.objectContaining({ name: 'hub unit' }));
    expect(test.service()).toBe(OLD);
  });

  it('restores the database when a bad migration leaves a schema the backup does not have', async () => {
    const test = world({ phase: 'built', up: true, migrates: 9 });
    const release = await handle(test.flow);
    expect(release.phase).toBe('reverted');
    expect(test.database()).toBe(EXPECTED);
    expect(test.service()).toBe(OLD);
  });

  it('resumes a completed swap without swapping again', async () => {
    const test = world({ phase: 'restarting', up: false });
    const release = await handle(test.flow);
    expect(release.phase).toBe('done');
    expect(test.service()).toBe(NEW);
    expect(test.database()).toBe(EXPECTED);
    expect(test.actions).toEqual([`start ${HUB_UNIT}`]);
  });
  it('restores the known backup if interrupted mid-swap', async () => {
    const test = world({ phase: 'applying', up: false });
    write(join(paths().service, 'service.mjs'), NEW);
    const release = await handle(test.flow);
    expect(release.phase).toBe('reverted');
    expect(test.service()).toBe(OLD);
    expect(test.actions).toEqual([`stop ${HUB_UNIT}`, `start ${HUB_UNIT}`]);
  });

  it('keeps a migration to the schema proven in preflight', async () => {
    const test = world({ phase: 'built', up: true, migrates: 3 });
    const release = await handle({
      ...test.flow,
      options: { ...test.flow.options, expectedSchema: 3 },
    });
    expect(release.phase).toBe('done');
    expect(release.changedDatabase).toBe(true);
    expect(test.database()).toBe('schema:3');
  });

  it('restores the backup if the hub fails during the recovery hold', async () => {
    const test = world({ phase: 'restarting', up: false });
    const unstableAt = Date.parse(AT) + 1000;
    const release = await handle({
      ...test.flow,
      options: { ...test.flow.options, holdSeconds: 1 },
      health: {
        ...test.flow.health,
        status: (url) =>
          Date.now() >= unstableAt && test.service() === NEW
            ? Promise.resolve(503)
            : test.flow.health.status(url),
      },
    });
    expect(release.phase).toBe('reverted');
    expect(test.service()).toBe(OLD);
  });

  it('leaves the working service untouched if no backup was ready', async () => {
    const test = world({ phase: 'planned', up: true });
    const release = await handle(test.flow);
    expect(release.phase).toBe('failed');
    expect(release.reason).toContain('before a backup was ready');
    expect(test.actions).toEqual([]);
    expect(test.service()).toBe(OLD);
  });

  it('reports unrecoverable, never an unknown outcome, when even the backup cannot come up', async () => {
    const test = world({ phase: 'built', up: true, devices: null, oldUp: false });
    const release = await handle(test.flow);
    expect(release.phase).toBe('unrecoverable');
    expect(existsSync(paths().backup)).toBe(true);
    expect(release.reason).not.toBeNull();
    expect(release.finishedAt).not.toBeNull();
    expect(test.service()).toBe(OLD);
    expect(test.actions).toContain(`stop ${HUB_UNIT}`);
  });

  it('keeps a healthy standalone hub whose owner has paired no devices yet', async () => {
    const test = world({ phase: 'built', up: true, devices: 0 });
    const release = await handle(test.flow);
    expect(release.phase).toBe('done');
    expect(release.checks).toContainEqual({ name: 'owner API', ok: true, detail: '0 devices' });
    expect(test.service()).toBe(NEW);
  });

  it('reverts a release whose new code refuses to start, naming the startup error', async () => {
    const test = world({ phase: 'built', up: true, migrates: 3, refuses: true });
    const release = await handle(test.flow);
    expect(release.phase).toBe('reverted');
    expect(test.service()).toBe(OLD);
    expect(test.database()).toBe(EXPECTED);
    expect(release.failedChecks.some((check) => check.name === 'startup errors')).toBe(true);
    expect(test.actions).toEqual([
      `stop ${HUB_UNIT}`,
      `start ${HUB_UNIT}`,
      `stop ${HUB_UNIT}`,
      `start ${HUB_UNIT}`,
    ]);
  });

  it('leaves a finished update alone when it is started again', async () => {
    const test = world({ phase: 'reverted', up: true });
    write(paths().health, `${HUB_HEALTHY}\n`);
    const release = await handle(test.flow);
    expect(release.phase).toBe('reverted');
    expect(existsSync(paths().health)).toBe(true);
    expect(test.actions).toEqual([]);
  });

  it('retries an unrecoverable restore from the same saved copy', async () => {
    const test = world({ phase: 'unrecoverable', up: false });
    const { backup, database } = paths();
    write(database, 'schema:9');
    const saved = join(backup, 'smarteverything.db');
    const release = await handle({
      ...test.flow,
      options: { ...test.flow.options, retryUnrecoverable: true },
    });
    expect(release.phase).toBe('reverted');
    expect(test.database()).toBe(EXPECTED);
    expect(existsSync(saved)).toBe(false);
  });

  it('settles after a transient malformed health response', async () => {
    const test = world({ phase: 'built', up: true });
    let malformed = true;
    const release = await handle({
      ...test.flow,
      health: {
        ...test.flow.health,
        devices: async (): Promise<number | null> => {
          if (malformed) {
            malformed = false;
            throw new SyntaxError('Incomplete health response');
          }
          return await test.flow.health.devices();
        },
      },
    });
    expect(release.phase).toBe('done');
    expect(test.service()).toBe(NEW);
  });

  it('records each phase it passes through in the ledger', async () => {
    const test = world({ phase: 'built', up: true });
    await handle(test.flow);
    const recorded = test.ledger();
    expect(recorded?.phase).toBe('done');
    expect(recorded?.revision).toBeGreaterThan(1);
    expect(recorded?.finishedAt).not.toBeNull();
  });

  it('waits at most the startup deadline for each verification and restores once', async () => {
    const test = world({ phase: 'applying', up: false, devices: null, oldUp: false });
    const release = await handle(test.flow);
    const waited = Date.now() - Date.parse(AT);
    expect(release.phase).toBe('unrecoverable');
    expect(waited).toBeLessThanOrEqual(2 * HUB_STARTUP_DEADLINE_MS + 2);
    expect(test.actions.filter((action) => action === `stop ${HUB_UNIT}`)).toHaveLength(1);
  });
  it('restores filesystem migration paths before the saved database and old service boot', async () => {
    const test = world({ phase: 'built', up: true, migrates: 9 });
    const order: string[] = [];
    const act = test.flow.units.act;
    const release = await handle({
      ...test.flow,
      migrations: {
        restore: () => {
          order.push('files');
          expect(test.database()).toBe('schema:9');
          return true;
        },
        clear: () => {
          order.push('cleanup');
          expect(test.ledger()?.phase).toBe('reverted');
        },
      },
      units: {
        ...test.flow.units,
        act: (verb, unit) => {
          if (verb === 'start' && test.service() === OLD) {
            order.push('old boot');
            expect(test.database()).toBe(EXPECTED);
          }
          act(verb, unit);
        },
      },
    });
    expect(release.phase).toBe('reverted');
    expect(order).toEqual(['files', 'old boot', 'cleanup']);
  });

  it('retains rollback inputs when file restoration fails and resumes the same restore', async () => {
    const test = world({ phase: 'applying', up: false });
    write(paths().database, 'schema:9');
    const broken = await handle({
      ...test.flow,
      migrations: {
        restore: () => {
          throw new Error('photo file changed');
        },
        clear: () => undefined,
      },
    });
    expect(broken.phase).toBe('unrecoverable');
    expect(existsSync(paths().backup)).toBe(true);
    expect(test.database()).toBe('schema:9');
    const restored = await handle({
      ...test.flow,
      options: { ...test.flow.options, retryUnrecoverable: true },
    });
    expect(restored.phase).toBe('reverted');
    expect(existsSync(paths().backup)).toBe(false);
  });

  it('resumes cleanup after the terminal healthy phase was durably recorded', async () => {
    const test = world({ phase: 'built', up: true });
    const release = await handle({
      ...test.flow,
      migrations: {
        restore: () => false,
        clear: () => {
          throw new Error('cleanup interrupted');
        },
      },
    });
    expect(release.phase).toBe('done');
    expect(existsSync(paths().backup)).toBe(true);
    const again = await handle(test.flow);
    expect(again.phase).toBe('done');
    expect(existsSync(paths().backup)).toBe(false);
    expect(test.actions).toEqual([`stop ${HUB_UNIT}`, `start ${HUB_UNIT}`]);
  });
  it('waits for offline preparation beyond the HTTP deadline before starting normal health checks', async () => {
    const test = world({ phase: 'built', up: true });
    let complete = false;
    const act = test.flow.units.act;
    const release = await handle({
      ...test.flow,
      prepareData: async () => {
        expect(test.ledger()?.phase).toBe('applying');
        expect(test.flow.units.active(HUB_UNIT)).toBe(false);
        await vi.advanceTimersByTimeAsync(HUB_STARTUP_DEADLINE_MS + 1);
        complete = true;
      },
      units: {
        ...test.flow.units,
        act: (verb, unit) => {
          if (verb === 'start') expect(complete).toBe(true);
          act(verb, unit);
        },
      },
    });
    expect(release.phase).toBe('done');
    expect(Date.now() - Date.parse(AT)).toBeGreaterThan(HUB_STARTUP_DEADLINE_MS);
    expect(test.service()).toBe(NEW);
  });

  it('restores saved paths and database when offline preparation fails before normal boot', async () => {
    const test = world({ phase: 'built', up: true });
    let restored = false;
    const act = test.flow.units.act;
    const release = await handle({
      ...test.flow,
      prepareData: () => {
        write(paths().database, 'schema:201');
        return Promise.reject(new Error('offline preparation failed'));
      },
      migrations: {
        restore: () => {
          restored = true;
          return true;
        },
        clear: () => undefined,
      },
      units: {
        ...test.flow.units,
        act: (verb, unit) => {
          if (verb === 'start') {
            expect(restored).toBe(true);
            expect(test.service()).toBe(OLD);
            expect(test.database()).toBe(EXPECTED);
          }
          act(verb, unit);
        },
      },
    });
    expect(release.phase).toBe('reverted');
    expect(test.actions).toEqual([`stop ${HUB_UNIT}`, `stop ${HUB_UNIT}`, `start ${HUB_UNIT}`]);
  });

  it('rolls back an interrupted offline preparation instead of booting its partial service', async () => {
    const test = world({ phase: 'applying', up: false });
    write(join(paths().service, 'service.mjs'), NEW);
    write(paths().database, 'schema:201');
    const release = await handle({
      ...test.flow,
      prepareData: () => Promise.reject(new Error('must not resume a partial apply')),
    });
    expect(release.phase).toBe('reverted');
    expect(test.service()).toBe(OLD);
    expect(test.database()).toBe(EXPECTED);
    expect(existsSync(paths().backup)).toBe(false);
  });
});
