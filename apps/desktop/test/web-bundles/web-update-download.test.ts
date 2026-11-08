import { randomUUID } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { controllerFor, homeServing, offerFor, useRig } from './web-update-fixture.js';

const rig = useRig();

describe('downloading', () => {
  it('leaves a replacement offer untouched when asked to download the earlier offer', async () => {
    const earlier = offerFor(randomUUID(), '2026-10-20T00:00:00.000Z');
    const replacement = offerFor(randomUUID(), '2026-10-21T00:00:00.000Z');
    const { home, fetch } = homeServing(earlier);
    const { controller, statuses } = await controllerFor(rig, fetch);
    await controller.check('release');
    home.compatible = replacement;
    const available = await controller.check('release');
    const requests = home.requests.length;
    const changes = statuses.length;

    await expect(controller.download(earlier.id)).rejects.toThrow('no longer available');

    expect(home.requests).toHaveLength(requests);
    expect(statuses).toHaveLength(changes);
    expect(controller.status()).toBe(available);
    expect(await rig.store.trialId()).toBeNull();
    expect((await controller.download(replacement.id)).state).toBe('ready');
    await expect(controller.download(earlier.id)).rejects.toThrow('no longer available');
  });

  it('clears corrupt partial files and can retry the same offer after checking again', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    home.corrupt = true;
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');

    const status = await controller.download(id);

    expect(status.state).toBe('failed');
    expect(status.state === 'failed' && status.offer?.id).toBe(id);
    expect(await readdir(rig.store.directory).catch(() => [])).toStrictEqual([]);

    home.corrupt = false;
    expect(await controller.check('release')).toMatchObject({ state: 'available', offer: { id } });
    const priorRequests = home.requests.length;
    expect(await controller.download(id)).toMatchObject({ state: 'ready', offer: { id } });
    expect(new URL(home.requests[priorRequests]?.url ?? '').pathname).toBe(
      '/api/app-updates/latest',
    );
    expect(await readdir(rig.store.directory)).toStrictEqual([id]);
  });

  it('reads a fresh signed link for the download instead of the one from the check', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');
    home.compatible = null;

    const status = await controller.download(id);

    expect(status.state === 'failed' && status.reason).toMatch(/no longer offers/u);
  });

  it('writes only complete bundles into the store folder', async () => {
    const id = randomUUID();
    const { fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');
    await controller.download(id);
    await writeFile(path.join(rig.parent, 'unrelated'), 'x');

    expect(await readdir(rig.store.directory)).toStrictEqual([id]);
  });
});
