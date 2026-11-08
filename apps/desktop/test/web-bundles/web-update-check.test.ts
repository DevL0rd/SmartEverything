import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  OTHER_RUNTIME,
  RUNTIME,
  controllerFor,
  homeServing,
  offerFor,
  useRig,
} from './web-update-fixture.js';

const rig = useRig();
const NEWER = {
  id: 'c29e9391-7db3-4524-a440-70f0924fe373',
  createdAt: '2026-10-22T00:00:00.000Z',
  appVersion: '2.0.0',
  notes: 'new shell',
  size: 10,
};

describe('what a check can answer', () => {
  it('needs an installer when only an update for another runtime exists', async () => {
    const { home, fetch } = homeServing(null);
    home.newerIncompatible = NEWER;
    const { controller } = await controllerFor(rig, fetch);

    const status = await controller.check('release');

    expect(status).toStrictEqual({ state: 'needs_installer', newer: home.newerIncompatible });
    expect(OTHER_RUNTIME).not.toBe(RUNTIME);
  });

  it('stays idle when the offer is the running bundle or older than it', async () => {
    const { home, fetch } = homeServing(offerFor(randomUUID(), '2026-09-01T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);

    expect((await controller.check('release')).state).toBe('idle');
    home.compatible = null;
    expect((await controller.check('release')).state).toBe('idle');
  });

  it('keeps a ready update when the same one is offered again', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');
    await controller.download(id);
    home.newerIncompatible = NEWER;

    expect((await controller.check('release')).state).toBe('ready');
  });

  it('needs an installer when the last compatible bundle is already running', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');
    await controller.download(id);
    await controller.apply({ kind: 'update', id }, () => undefined);
    await controller.confirm();
    home.newerIncompatible = NEWER;

    expect(await controller.check('release')).toStrictEqual({
      state: 'needs_installer',
      newer: NEWER,
    });
  });

  it('needs an installer when the compatible bundle predates the embedded bundle', async () => {
    const { home, fetch } = homeServing(offerFor(randomUUID(), '2026-09-01T00:00:00.000Z'));
    home.newerIncompatible = NEWER;
    const { controller } = await controllerFor(rig, fetch);

    expect(await controller.check('release')).toStrictEqual({
      state: 'needs_installer',
      newer: NEWER,
    });
  });

  it('offers the newest compatible bundle directly before an incompatible release', async () => {
    const latest = offerFor(randomUUID(), '2026-10-20T00:00:00.000Z');
    const { home, fetch } = homeServing(latest);
    home.newerIncompatible = NEWER;
    const { controller } = await controllerFor(rig, fetch);

    expect(await controller.check('release')).toStrictEqual({ state: 'available', offer: latest });
    await controller.download(latest.id);
    expect(controller.status()).toStrictEqual({ state: 'ready', offer: latest });
  });

  it('does not require an installer for a release older than the running bundle', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-25T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');
    await controller.download(id);
    await controller.apply({ kind: 'update', id }, () => undefined);
    await controller.confirm();
    home.compatible = null;
    home.newerIncompatible = NEWER;

    expect(await controller.check('release')).toMatchObject({ state: 'idle', running: { id } });
  });

  it('keeps a failed compatible bundle rolled back when an installer is newer', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');
    await controller.download(id);
    await controller.apply({ kind: 'update', id }, () => undefined);
    const rolledBack = await controller.bootFailed('The trial crashed.');
    home.newerIncompatible = NEWER;

    expect(await controller.check('release')).toStrictEqual(rolledBack);
  });

  it('keeps an offered rollback ahead of an incompatible release', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('release');
    await controller.download(id);
    await controller.apply({ kind: 'update', id }, () => undefined);
    await controller.confirm();
    home.compatible = null;
    home.newerIncompatible = NEWER;
    home.rollback = true;

    expect(await controller.check('release')).toStrictEqual({
      state: 'rollback_ready',
      currentId: id,
    });
  });

  it('reports a failed check with its reason', async () => {
    const refusing: typeof fetch = () =>
      Promise.resolve(Response.json({ error: 'forbidden' }, { status: 403 }));
    const { controller } = await controllerFor(rig, refusing);

    const status = await controller.check('release');

    expect(status.state).toBe('failed');
    expect(status.state === 'failed' && status.offer).toBeNull();
  });

  it('is disabled with the reason for unpackaged and development copies', async () => {
    const id = randomUUID();
    const asked: string[] = [];
    const watching: typeof fetch = () => {
      asked.push('asked');
      return Promise.resolve(Response.json({}));
    };
    const { controller } = await controllerFor(rig, watching, {
      mode: { kind: 'disabled', reason: 'This copy runs from source.' },
    });

    expect(await controller.check('release')).toStrictEqual({
      state: 'disabled',
      reason: 'This copy runs from source.',
    });
    expect((await controller.download(id)).state).toBe('disabled');
    expect((await controller.apply({ kind: 'update', id }, () => undefined)).state).toBe(
      'disabled',
    );
    expect(asked).toStrictEqual([]);
  });

  it('is disabled while this computer is not connected to a home', async () => {
    const { fetch } = homeServing(null);
    const { controller } = await controllerFor(rig, fetch, { connected: false });

    const status = await controller.check('release');

    expect(status.state === 'disabled' && status.reason).toMatch(/Connect this computer/u);
  });
});
