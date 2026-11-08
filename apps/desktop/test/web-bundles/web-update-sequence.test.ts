import { randomUUID } from 'node:crypto';
import {} from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  RUNTIME,
  controllerFor,
  homeServing,
  offerFor,
  stateOf,
  useRig,
} from './web-update-fixture.js';

const rig = useRig();

describe('the update sequence', () => {
  it('goes from check to available, downloading by whole percent, ready and applying', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller, statuses } = await controllerFor(rig, fetch);
    const reloads: string[] = [];

    expect((await controller.check('release')).state).toBe('available');
    expect((await controller.download(id)).state).toBe('ready');
    const applied = await controller.apply({ kind: 'update', id }, () => {
      reloads.push('reload');
    });

    expect(applied.state).toBe('applying');
    expect(reloads).toStrictEqual(['reload']);
    expect(await stateOf(rig)).toMatchObject({ active: id, trial: true });
    const percents = statuses.flatMap((status) =>
      status.state === 'downloading' ? [Math.floor((status.received * 100) / status.total)] : [],
    );
    expect(percents).toStrictEqual(Array.from({ length: 101 }, (_, percent) => percent));
    expect(
      statuses.map((status) => status.state).filter((state) => state !== 'downloading'),
    ).toStrictEqual(['checking', 'available', 'ready', 'applying']);
    const query = new URL(home.requests[0]?.url ?? '').searchParams;
    expect(Object.fromEntries(query)).toStrictEqual({
      platform: 'desktop',
      channel: 'release',
      runtimeVersion: RUNTIME,
    });
    expect(home.requests[0]?.headers.get('authorization')).toBe('Bearer set_token');
  });

  it('asks with the running id and returns to idle once the boot is confirmed', async () => {
    const id = randomUUID();
    const { home, fetch } = homeServing(offerFor(id, '2026-10-20T00:00:00.000Z'));
    const { controller } = await controllerFor(rig, fetch);
    await controller.check('dev');
    await controller.download(id);
    await controller.apply({ kind: 'update', id }, () => undefined);

    const confirmed = await controller.confirm();

    expect(confirmed).toStrictEqual({
      state: 'idle',
      running: { id, createdAt: '2026-10-20T00:00:00.000Z' },
    });
    expect((await stateOf(rig)).trial).toBe(false);
    await controller.check('dev');
    expect(new URL(home.requests.at(-1)?.url ?? '').searchParams.get('currentId')).toBe(id);
    expect(controller.status().state).toBe('idle');
  });
});
