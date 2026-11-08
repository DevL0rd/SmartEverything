import { randomUUID } from 'node:crypto';
import {} from 'node:fs/promises';
import path from 'node:path';
import type { WebUpdateStatus } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  EMBEDDED_AT,
  controllerFor,
  homeServing,
  offerFor,
  stateOf,
  useRig,
} from './web-update-fixture.js';
import type { WebUpdateController } from '../../src/web-bundles/web-update-controller.js';

const rig = useRig();

describe('rolling back', () => {
  async function appliedController(
    fetchFrom: typeof fetch,
    id: string,
  ): Promise<{ controller: WebUpdateController; statuses: WebUpdateStatus[] }> {
    const harness = await controllerFor(rig, fetchFrom);
    await harness.controller.check('release');
    await harness.controller.download(id);
    await harness.controller.apply({ kind: 'update', id }, () => undefined);
    return harness;
  }

  it('reverts to the embedded bundle when the new one fails to boot', async () => {
    const id = randomUUID();
    const { fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await appliedController(fetch, id);

    const status = await controller.bootFailed('the render process crashed');

    expect(status).toStrictEqual({
      state: 'rolled_back',
      failedId: id,
      reason: 'the render process crashed',
    });
    expect(await stateOf(rig)).toMatchObject({ active: 'embedded', trial: false, failed: [id] });
    expect(await rig.store.rootFor(rig.build)).toBe(rig.build.embeddedRoot);
  });

  it('reverts at launch when the last trial never confirmed', async () => {
    const id = randomUUID();
    const { fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    await appliedController(fetch, id);
    const { controller: relaunched } = await controllerFor(rig, fetch);
    expect(relaunched.status()).toMatchObject({ state: 'idle', running: { id } });

    const status = await relaunched.launchCheck();

    expect(status.state).toBe('rolled_back');
    expect(status.state === 'rolled_back' && status.failedId).toBe(id);
    expect(await stateOf(rig)).toMatchObject({ active: 'embedded', trial: false, failed: [id] });
  });

  it('does nothing at launch or on a boot failure when no trial is running', async () => {
    const { fetch } = homeServing(null);
    const { controller } = await controllerFor(rig, fetch);

    expect((await controller.launchCheck()).state).toBe('idle');
    expect((await controller.bootFailed('late error')).state).toBe('idle');
  });

  it('returns to the built-in bundle only after confirming an offered rollback', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await appliedController(fetch, id);
    await controller.confirm();
    home.compatible = null;
    home.rollback = true;

    expect(await controller.check('release')).toStrictEqual({
      state: 'rollback_ready',
      currentId: id,
    });
    expect(await rig.store.rootFor(rig.build)).toBe(path.join(rig.store.directory, id));
    await expect(controller.apply({ kind: 'update', id }, () => undefined)).rejects.toThrow(
      'no longer ready',
    );
    home.rollback = false;
    expect(await controller.apply({ kind: 'built_in' }, () => undefined)).toMatchObject({
      state: 'failed',
    });
    expect(await rig.store.rootFor(rig.build)).toBe(path.join(rig.store.directory, id));

    home.rollback = true;
    await controller.check('release');
    expect(await controller.apply({ kind: 'built_in' }, () => undefined)).toStrictEqual({
      state: 'applying',
    });
    expect(await rig.store.rootFor(rig.build)).toBe(rig.build.embeddedRoot);
    expect(await controller.confirm()).toStrictEqual({
      state: 'idle',
      running: { id: 'embedded', createdAt: EMBEDDED_AT },
    });
  });

  it('does not offer a failed id again from a check, only to an explicit download', async () => {
    const id = randomUUID();
    const { fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await appliedController(fetch, id);
    await controller.bootFailed('the app crashed');

    const checked = await controller.check('release');
    expect(checked.state).toBe('rolled_back');

    const { controller: restarted } = await controllerFor(rig, fetch);
    expect((await restarted.check('release')).state).toBe('idle');
    expect((await restarted.download(id)).state).toBe('idle');

    const retried = await controller.download(id);
    expect(retried.state).toBe('ready');
    expect(retried.state === 'ready' && retried.offer.id).toBe(id);
  });
});
