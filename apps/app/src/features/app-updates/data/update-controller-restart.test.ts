import { describe, expect, it, vi } from 'vitest';
import { UpdateFailure } from '../model/adapter';
import { OFFER, REPLACEMENT, setup, settle } from './update-controller-world';

const OFFLINE = new UpdateFailure(
  'restart',
  'Your home can’t be reached right now. Try again when you’re connected.',
  'unreachable',
  true,
);

const WITHDRAWN_FAILURE = new UpdateFailure(
  'restart',
  'This update is no longer available. Check for updates again.',
  'The home no longer offers the downloaded update.',
);

async function failedRestart(failure: Error): Promise<ReturnType<typeof setup>> {
  const world = setup();
  vi.mocked(world.adapter.restart).mockRejectedValueOnce(failure);
  await world.controller.check('live');
  await world.controller.download(OFFER.id);
  return world;
}

describe('the app update controller restarts', () => {
  it('keeps the downloaded update and says why when the restart cannot be confirmed', async () => {
    const world = await failedRestart(OFFLINE);
    expect(world.controller.state()).toMatchObject({
      kind: 'failed',
      cause: 'restart',
      reason: OFFLINE.sentence,
      offer: OFFER,
      target: { kind: 'update', offer: OFFER },
    });
    expect(world.prefs().pendingId).toBeNull();
  });

  it('restarts again on Try again without downloading or checking again', async () => {
    const world = await failedRestart(OFFLINE);
    await world.controller.retry(OFFER.id);
    expect(world.adapter.download).toHaveBeenCalledTimes(1);
    expect(world.adapter.check).toHaveBeenCalledTimes(1);
    expect(world.adapter.restart).toHaveBeenCalledTimes(2);
    expect(world.controller.state().kind).toBe('restarting');
    expect(world.prefs()).toMatchObject({ pendingId: OFFER.id, launchedId: OFFER.id });
  });

  it('checks again on Try again when the home no longer offers the update', async () => {
    const world = await failedRestart(WITHDRAWN_FAILURE);
    expect(world.controller.state()).toMatchObject({ kind: 'failed', target: null });
    vi.mocked(world.adapter.check).mockResolvedValueOnce({
      compatible: REPLACEMENT,
      newer: null,
      rollBackToEmbedded: false,
    });
    await world.controller.retry();
    expect(world.adapter.restart).toHaveBeenCalledTimes(1);
    expect(world.controller.state()).toEqual({ kind: 'available', offer: REPLACEMENT });
  });

  it('does not check while the downloaded update waits for a restart', async () => {
    const world = await failedRestart(OFFLINE);
    await world.controller.check('button');
    await world.controller.check('notice');
    expect(world.adapter.check).toHaveBeenCalledTimes(1);
    expect(world.controller.state().kind).toBe('failed');
  });

  it('restarts directly from Restart now without asking', async () => {
    const world = await failedRestart(OFFLINE);
    world.controller.requestRestart(OFFER.id);
    await settle();
    expect(world.ask).not.toHaveBeenCalled();
    expect(world.adapter.restart).toHaveBeenCalledTimes(2);
  });

  it('ignores Restart now for another offer', async () => {
    const world = await failedRestart(OFFLINE);
    world.controller.requestRestart(REPLACEMENT.id);
    await settle();
    expect(world.adapter.restart).toHaveBeenCalledTimes(1);
  });

  it('restarts from the tray item only when an update waits', async () => {
    const world = setup();
    const stop = world.controller.listenForConfirmRequests();
    await world.controller.check('live');
    world.clickTray();
    await settle();
    expect(world.adapter.restart).not.toHaveBeenCalled();
    vi.mocked(world.adapter.restart).mockRejectedValueOnce(OFFLINE);
    await world.controller.download(OFFER.id);
    world.clickTray();
    await settle();
    expect(world.ask).not.toHaveBeenCalled();
    expect(world.adapter.restart).toHaveBeenCalledTimes(2);
    stop();
    expect(world.trayListening()).toBe(false);
  });

  it('clears the pending update when the restart fails', async () => {
    const world = await failedRestart(new Error('Reload failed'));
    expect(world.controller.state()).toMatchObject({ kind: 'failed', cause: 'restart' });
    expect(world.prefs()).toMatchObject({ pendingId: null, launchedId: null });
  });
});
