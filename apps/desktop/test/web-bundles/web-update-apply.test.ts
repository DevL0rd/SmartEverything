import { randomUUID } from 'node:crypto';
import {} from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { controllerFor, homeServing, offerFor, stateOf, useRig } from './web-update-fixture.js';

const rig = useRig();

describe('applying', () => {
  it('preserves the ready bundle when asked to apply a different target', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller, statuses } = await controllerFor(rig, fetch);
    await controller.check('release');
    const ready = await controller.download(id);
    const requests = home.requests.length;
    const changes = statuses.length;
    const reloads: string[] = [];
    const reload = (): void => {
      reloads.push('reload');
    };

    await expect(controller.apply({ kind: 'update', id: randomUUID() }, reload)).rejects.toThrow(
      'no longer ready',
    );
    await expect(controller.apply({ kind: 'built_in' }, reload)).rejects.toThrow('no longer ready');

    expect(home.requests).toHaveLength(requests);
    expect(statuses).toHaveLength(changes);
    expect(reloads).toStrictEqual([]);
    expect(controller.status()).toBe(ready);
    expect(await rig.store.trialId()).toBeNull();
    expect(await rig.store.rootFor(rig.build)).toBe(rig.build.embeddedRoot);
    expect((await controller.apply({ kind: 'update', id }, reload)).state).toBe('applying');
    await expect(controller.apply({ kind: 'update', id }, reload)).rejects.toThrow('applying');
    expect(reloads).toStrictEqual(['reload']);
  });

  it('does not start a downloaded update after the home withdraws it', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');
    await controller.download(id);
    home.compatible = null;
    const status = await controller.apply({ kind: 'update', id }, () => {
      throw new Error('A withdrawn update must not reload');
    });
    expect(status.state === 'failed' && status.reason).toContain('no longer offers');
    expect(await rig.store.trialId()).toBeNull();
    expect(await rig.store.rootFor(rig.build)).toBe(rig.build.embeddedRoot);
  });

  it('clears the trial and restores the root when restarting throws', async () => {
    const id = randomUUID();
    const { fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');
    await controller.download(id);

    const status = await controller.apply({ kind: 'update', id }, () => {
      throw new Error('The window has closed');
    });

    expect(status.state === 'failed' && status.reason).toContain('window has closed');
    expect(await stateOf(rig)).toMatchObject({ active: 'embedded', trial: false, failed: [id] });
  });
});
