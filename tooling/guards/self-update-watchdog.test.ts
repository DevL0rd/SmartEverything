import { chmodSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  HUB_HEALTHY,
  HUB_STARTUP_DEADLINE_MS,
  HUB_UNIT,
  HUB_UPDATE_BOOT_RECEIPT_FILE,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { serviceIdentity } from '../self-update-service-identity.ts';
import { handle } from '../self-update-watchdog.ts';
import type { WatchdogOrder } from '../self-update-watchdog-contract.ts';
import { reportFile, type Flow } from '../self-update-watchdog-engine.ts';
import { AT, OLD, NEW, EXPECTED, paths, write, world } from './self-update-watchdog-fixture.ts';

const REPORT = z.record(z.string(), z.unknown());

function ordered(flow: Flow, order: WatchdogOrder): Flow {
  return { ...flow, options: { ...flow.options, order } };
}

function report(flow: Flow): Record<string, unknown> {
  return REPORT.parse(JSON.parse(readFileSync(reportFile(flow), 'utf8')));
}

describe('the hub update watchdog', { timeout: 60_000 }, () => {
  it('rewrites the hub unit while the hub is stopped, before the new release starts', async () => {
    const test = world({ phase: 'built', up: true });
    await handle(test.flow);
    expect(test.refreshes).toEqual(['stopped']);
  });

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

  it('waits for the owner when the new release fails its checks and restores nothing', async () => {
    const test = world({ phase: 'built', up: true, devices: null });
    const release = await handle(test.flow);
    expect(release.phase).toBe('awaiting_decision');
    expect(release.finishedAt).toBeNull();
    expect(release.failedChecks).toContainEqual(expect.objectContaining({ name: 'owner API' }));
    expect(test.service()).toBe(NEW);
    expect(existsSync(paths().backup)).toBe(true);
    expect(existsSync(paths().health)).toBe(false);
    expect(test.actions).toEqual([`stop ${HUB_UNIT}`, `start ${HUB_UNIT}`]);
    const written = report(test.flow);
    expect(written).toMatchObject({
      runId: release.runId,
      phase: 'awaiting_decision',
      backup: paths().backup,
      choices: ['rollback', 'recover', 'keep'],
    });
    expect(JSON.stringify(written['commands'])).toContain('update/hub-command.mjs');
  });

  it('restores the backup only when the owner orders the rollback', async () => {
    const test = world({ phase: 'built', up: true, devices: null });
    await handle(test.flow);
    await handle(test.flow);
    expect(test.service()).toBe(NEW);
    const release = await handle(ordered(test.flow, 'rollback'));
    expect(release.phase).toBe('reverted');
    expect(release.reason).toContain('the owner ordered a rollback');
    expect(test.service()).toBe(OLD);
    expect(test.database()).toBe(EXPECTED);
    expect(existsSync(paths().backup)).toBe(false);
    expect(existsSync(reportFile(test.flow))).toBe(false);
    expect(test.actions).toEqual([
      `stop ${HUB_UNIT}`,
      `start ${HUB_UNIT}`,
      `stop ${HUB_UNIT}`,
      `start ${HUB_UNIT}`,
    ]);
  });

  it('refuses an ordered rollback of a release that is not waiting for a decision', async () => {
    const test = world({ phase: 'restarting', up: false });
    const release = await handle(ordered(test.flow, 'rollback'));
    expect(release.phase).toBe('restarting');
    expect(test.actions).toEqual([]);
    expect(test.service()).toBe(NEW);
  });

  it('finishes a failed release as kept on the owner order without restoring or deleting the backup', async () => {
    const test = world({ phase: 'awaiting_decision', up: false });
    const release = await handle(ordered(test.flow, 'keep'));
    expect(release.phase).toBe('kept');
    expect(release.reason).toContain('the owner kept the new release as it is');
    expect(release.finishedAt).not.toBeNull();
    expect(existsSync(paths().backup)).toBe(true);
    expect(test.actions).toEqual([]);
  });

  it('refuses an ordered keep of a release that is not waiting for a decision', async () => {
    const test = world({ phase: 'restarting', up: false });
    const release = await handle(ordered(test.flow, 'keep'));
    expect(release.phase).toBe('restarting');
    expect(test.actions).toEqual([]);
  });

  it('tries the release again when the owner orders a recovery', async () => {
    const test = world({ phase: 'built', up: true });
    let broken = true;
    const devices = test.flow.health.devices;
    const flaky: Flow = {
      ...test.flow,
      health: { ...test.flow.health, devices: () => (broken ? Promise.resolve(null) : devices()) },
    };
    expect((await handle(flaky)).phase).toBe('awaiting_decision');
    broken = false;
    const release = await handle(ordered(flaky, 'recover'));
    expect(release.phase).toBe('done');
    expect(test.service()).toBe(NEW);
    expect(existsSync(paths().backup)).toBe(false);
    expect(existsSync(reportFile(test.flow))).toBe(false);
  });

  it('captures writes after quiescing the hub and preserves them on migration rollback', async () => {
    const test = world({ phase: 'built', up: true, migrates: 9 });
    const { database, backup } = paths();
    const acknowledged = `${EXPECTED}\nlast acknowledged write`;
    const act = test.flow.units.act;
    const flow: Flow = {
      ...test.flow,
      units: {
        ...test.flow.units,
        act: (verb: Parameters<typeof act>[0], unit: string): void => {
          if (verb === 'stop' && unit === HUB_UNIT && test.service() === OLD)
            write(database, acknowledged);
          act(verb, unit);
        },
      },
    };
    expect((await handle(flow)).phase).toBe('awaiting_decision');
    const release = await handle(ordered(flow, 'rollback'));
    expect(release.phase).toBe('reverted');
    expect(existsSync(backup)).toBe(false);
    expect(test.database()).toBe(acknowledged);
  });

  it('preserves writes on same-schema rollback without replacing the live database', async () => {
    const test = world({ phase: 'built', up: true, devices: null });
    const acknowledged = `${EXPECTED}\nwrite acknowledged by the new hub`;
    const flow: Flow = {
      ...test.flow,
      health: {
        ...test.flow.health,
        devices: async (): Promise<number | null> => {
          if (test.service() === NEW) write(paths().database, acknowledged);
          return await test.flow.health.devices();
        },
      },
    };
    expect((await handle(flow)).phase).toBe('awaiting_decision');
    expect(test.database()).toBe(acknowledged);
    const release = await handle(ordered(flow, 'rollback'));
    expect(release.phase).toBe('reverted');
    expect(test.database()).toBe(acknowledged);
  });

  it('holds a release for the owner even if an automatically restarted service is active again', async () => {
    const test = world({ phase: 'built', up: true });
    const release = await handle({
      ...test.flow,
      units: {
        ...test.flow.units,
        restarts: (unit) => (unit === HUB_UNIT && test.service() === NEW ? 1 : 0),
      },
    });
    expect(release.phase).toBe('awaiting_decision');
    expect(release.failedChecks).toContainEqual(expect.objectContaining({ name: 'hub unit' }));
    expect(test.service()).toBe(NEW);
  });

  it('restores the database on an ordered rollback when a bad migration left a schema the backup does not have', async () => {
    const test = world({ phase: 'built', up: true, migrates: 9 });
    expect((await handle(test.flow)).phase).toBe('awaiting_decision');
    expect(test.database()).toBe('schema:9');
    const release = await handle(ordered(test.flow, 'rollback'));
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
  it('waits for the owner if interrupted mid-swap and applies again on an ordered recovery', async () => {
    const test = world({ phase: 'applying', up: false });
    write(join(paths().service, 'service.mjs'), 'partial');
    const waiting = await handle(test.flow);
    expect(waiting.phase).toBe('awaiting_decision');
    expect(waiting.reason).toContain('stopped while replacing the service');
    expect(test.actions).toEqual([]);
    expect(test.service()).toBe('partial');
    const release = await handle(ordered(test.flow, 'recover'));
    expect(release.phase).toBe('done');
    expect(test.service()).toBe(NEW);
    expect(test.actions).toEqual([`start ${HUB_UNIT}`]);
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

  it('waits for the owner if the hub fails during the hold', async () => {
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
    expect(release.phase).toBe('awaiting_decision');
    expect(test.service()).toBe(NEW);
    expect(existsSync(paths().backup)).toBe(true);
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
    expect((await handle(test.flow)).phase).toBe('awaiting_decision');
    const release = await handle(ordered(test.flow, 'rollback'));
    expect(release.phase).toBe('unrecoverable');
    expect(existsSync(paths().backup)).toBe(true);
    expect(report(test.flow)).toMatchObject({ phase: 'unrecoverable' });
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

  it('reports a release whose new code refuses to start, naming the startup error', async () => {
    const test = world({ phase: 'built', up: true, migrates: 3, refuses: true });
    const release = await handle(test.flow);
    expect(release.phase).toBe('awaiting_decision');
    expect(test.service()).toBe(NEW);
    expect(release.failedChecks.some((check) => check.name === 'startup errors')).toBe(true);
    expect(test.actions).toEqual([`stop ${HUB_UNIT}`, `start ${HUB_UNIT}`]);
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
    const release = await handle(ordered(test.flow, 'rollback'));
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
    expect((await handle(ordered(test.flow, 'recover'))).phase).toBe('awaiting_decision');
    expect(Date.now() - Date.parse(AT)).toBeLessThanOrEqual(HUB_STARTUP_DEADLINE_MS + 2);
    const release = await handle(ordered(test.flow, 'rollback'));
    const waited = Date.now() - Date.parse(AT);
    expect(release.phase).toBe('unrecoverable');
    expect(waited).toBeLessThanOrEqual(2 * HUB_STARTUP_DEADLINE_MS + 3);
    expect(test.actions.filter((action) => action === `stop ${HUB_UNIT}`)).toHaveLength(1);
  });
  it('restores filesystem migration paths before the saved database and old service boot', async () => {
    const test = world({ phase: 'built', up: true, migrates: 9 });
    const order: string[] = [];
    const act = test.flow.units.act;
    expect((await handle(test.flow)).phase).toBe('awaiting_decision');
    const release = await handle({
      ...ordered(test.flow, 'rollback'),
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
    const test = world({ phase: 'awaiting_decision', up: false });
    write(paths().database, 'schema:9');
    const broken = await handle({
      ...ordered(test.flow, 'rollback'),
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
    const restored = await handle(ordered(test.flow, 'rollback'));
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

  it('restores saved paths and database when the owner rolls back a failed offline preparation', async () => {
    const test = world({ phase: 'built', up: true });
    let restored = false;
    const act = test.flow.units.act;
    const failing: Flow = {
      ...test.flow,
      prepareData: () => {
        write(paths().database, 'schema:201');
        return Promise.reject(new Error('offline preparation failed'));
      },
    };
    const waiting = await handle(failing);
    expect(waiting.phase).toBe('awaiting_decision');
    expect(waiting.reason).toContain('offline preparation failed');
    expect(test.actions).toEqual([`stop ${HUB_UNIT}`]);
    const release = await handle({
      ...ordered(failing, 'rollback'),
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

  it('waits for the owner after an interrupted offline preparation instead of booting its partial service', async () => {
    const test = world({ phase: 'applying', up: false });
    write(join(paths().service, 'service.mjs'), NEW);
    write(paths().database, 'schema:201');
    const release = await handle({
      ...test.flow,
      prepareData: () => Promise.reject(new Error('must not resume a partial apply')),
    });
    expect(release.phase).toBe('awaiting_decision');
    expect(test.actions).toEqual([]);
    expect(test.database()).toBe('schema:201');
    expect(existsSync(paths().backup)).toBe(true);
  });
});
