import { describe, expect, it, vi } from 'vitest';
import {
  FOUND,
  OFFER,
  RUNNING_OFFER,
  WITHDRAWN,
  noticeFor,
  setup,
  settle,
} from './update-controller-world';

const CRASHED = {
  kind: 'started',
  running: { kind: 'embedded', builtAt: null },
  runtimeVersion: 'runtime-a',
  emergency: { failedId: null, reason: 'The update crashed on start' },
} as const;

const BUILT_IN_QUESTION: unknown = expect.objectContaining({
  title: 'Restart to go back to the built-in version?',
});

describe('the app update controller rolls back', () => {
  it('shows the withdrawn update without asking or restarting', async () => {
    const world = setup({ outcome: WITHDRAWN, start: RUNNING_OFFER });
    await world.controller.check('live');
    await settle();
    expect(world.adapter.prepareRollback).toHaveBeenCalledTimes(1);
    expect(world.controller.state()).toEqual({ kind: 'ready', target: { kind: 'built_in' } });
    expect(world.ask).not.toHaveBeenCalled();
    expect(world.adapter.restart).not.toHaveBeenCalled();
    expect(world.prefs().pendingId).toBe('built_in');
  });

  it('asks only when Restart now is pressed and restarts after the answer', async () => {
    const world = setup({ outcome: WITHDRAWN, start: RUNNING_OFFER });
    await world.controller.check('notice');
    world.controller.requestRestart();
    world.controller.requestRestart();
    await settle();
    expect(world.ask).toHaveBeenCalledExactlyOnceWith(BUILT_IN_QUESTION);
    expect(world.adapter.restart).toHaveBeenCalledTimes(1);
  });

  it('stays ready when the question is declined', async () => {
    const world = setup({ outcome: WITHDRAWN, start: RUNNING_OFFER });
    world.ask.mockResolvedValueOnce(false);
    await world.controller.check('notice');
    world.controller.requestRestart();
    await settle();
    expect(world.adapter.restart).not.toHaveBeenCalled();
    expect(world.controller.state().kind).toBe('ready');
  });

  it('waits out a call and then shows the banner without restarting', async () => {
    const world = setup({ outcome: WITHDRAWN, start: RUNNING_OFFER });
    world.setBusy(true);
    await world.controller.check('live');
    expect(world.controller.state().kind).toBe('waiting_for_call');
    world.setBusy(false);
    await settle();
    expect(world.controller.state().kind).toBe('ready');
    expect(world.adapter.restart).not.toHaveBeenCalled();
    expect(world.ask).not.toHaveBeenCalled();
  });

  it('asks from the tray item for the built-in version', async () => {
    const world = setup({ outcome: WITHDRAWN, start: RUNNING_OFFER });
    world.controller.listenForConfirmRequests();
    await world.controller.check('live');
    world.clickTray();
    await settle();
    expect(world.ask).toHaveBeenCalledExactlyOnceWith(BUILT_IN_QUESTION);
  });

  it('offers only the rollback when an in-flight check withdraws the update before download', async () => {
    const world = setup();
    await world.controller.check('live');
    let finish = (): void => undefined;
    vi.mocked(world.adapter.check).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = (): void => {
            resolve(WITHDRAWN);
          };
        }),
    );
    const checking = world.controller.check('live');
    const downloading = world.controller.download(OFFER.id);
    await settle();
    finish();
    await Promise.all([checking, downloading]);
    expect(world.adapter.download).not.toHaveBeenCalled();
    expect(world.reports).toEqual([]);
    expect(world.controller.state()).toEqual({ kind: 'ready', target: { kind: 'built_in' } });
  });

  it('checks a publication before offering a rollback that was still being prepared', async () => {
    const world = setup({ outcome: WITHDRAWN });
    let finishPreparing = (): void => undefined;
    let preparationStarted = (): void => undefined;
    const preparing = new Promise<void>((resolve) => {
      preparationStarted = resolve;
    });
    vi.mocked(world.adapter.prepareRollback).mockImplementation(() => {
      preparationStarted();
      return new Promise((resolve) => {
        finishPreparing = resolve;
      });
    });
    await world.controller.start();
    const checking = world.controller.check('live');
    await preparing;
    vi.mocked(world.adapter.check).mockResolvedValue(FOUND);
    world.controller.receiveNotice(noticeFor(OFFER.id));
    finishPreparing();
    await checking;
    expect(world.controller.state()).toEqual({ kind: 'available', offer: OFFER });
    expect(world.prefs().pendingId).toBeNull();
    expect(world.ask).not.toHaveBeenCalled();
  });

  it('shows a failed check when the return to the built-in version cannot be prepared', async () => {
    const world = setup({ outcome: WITHDRAWN });
    vi.mocked(world.adapter.prepareRollback).mockRejectedValue(new Error('No directive'));
    await world.controller.check('button');
    expect(world.controller.state()).toMatchObject({ kind: 'failed', cause: 'check' });
    expect(world.prefs().pendingId).toBeNull();
  });

  it('reports a rolled back update and explains it in one plain sentence', async () => {
    const world = setup({ prefs: { pendingId: OFFER.id, launchedId: OFFER.id }, start: CRASHED });
    await world.controller.check('live');
    expect(world.controller.state()).toEqual({
      kind: 'rolled_back',
      failedId: OFFER.id,
      reason: 'The update stopped before it opened.',
      retrying: false,
    });
    expect(world.prefs().pendingId).toBeNull();
    expect(world.reports).toEqual([
      {
        updateId: OFFER.id,
        outcome: 'rolled_back',
        reason: 'The update crashed on start',
      },
    ]);
  });

  it('does not offer the rolled back update from a background check', async () => {
    const world = setup({ prefs: { pendingId: OFFER.id, launchedId: OFFER.id }, start: CRASHED });
    await world.controller.start();
    await world.controller.check('notice');
    expect(world.controller.state().kind).toBe('rolled_back');
    await world.controller.check('button');
    expect(world.controller.state()).toEqual({ kind: 'available', offer: OFFER });
  });

  it('runs a check, not a download, on Try again after a rollback', async () => {
    const world = setup({ prefs: { pendingId: OFFER.id, launchedId: OFFER.id }, start: CRASHED });
    await world.controller.start();
    await world.controller.retry();
    expect(world.adapter.check).toHaveBeenCalledTimes(1);
    expect(world.adapter.download).not.toHaveBeenCalled();
    expect(world.controller.state().kind).toBe('available');
  });

  it('names the crashed update from the launch it recorded after the apply was reported', async () => {
    const world = setup({ prefs: { launchedId: OFFER.id }, start: CRASHED });
    await world.controller.start();
    expect(world.controller.state()).toMatchObject({ kind: 'rolled_back', failedId: OFFER.id });
    expect(world.prefs()).toEqual({ channel: 'release', launchedId: null, pendingId: null });
    expect(world.reports).toEqual([
      {
        updateId: OFFER.id,
        outcome: 'rolled_back',
        reason: 'The update crashed on start',
      },
    ]);
  });

  it('explains a rollback as a failed start even when no launch was recorded', async () => {
    const world = setup({ start: CRASHED });
    await world.controller.start();
    expect(world.controller.state()).toMatchObject({ kind: 'rolled_back', failedId: null });
    expect(world.reports).toEqual([
      {
        updateId: null,
        outcome: 'rolled_back',
        reason: 'The update crashed on start',
      },
    ]);
  });

  it('reports an applied update once it runs', async () => {
    const world = setup({ prefs: { pendingId: OFFER.id }, start: RUNNING_OFFER });
    await world.controller.start();
    expect(world.reports[0]?.outcome).toBe('applied');
    expect(world.prefs().pendingId).toBeNull();
  });

  it('reports the built-in version as applied once it runs after the return', async () => {
    const world = setup({ prefs: { pendingId: 'built_in' } });
    await world.controller.start();
    expect(world.reports).toEqual([{ updateId: null, outcome: 'applied', reason: null }]);
    expect(world.prefs().pendingId).toBeNull();
  });

  it('clears and reports a pending update that never ran', async () => {
    const world = setup({ prefs: { pendingId: OFFER.id } });
    await world.controller.start();
    expect(world.prefs().pendingId).toBeNull();
    expect(world.reports).toEqual([
      {
        updateId: OFFER.id,
        outcome: 'rolled_back',
        reason: 'The update was not running after the restart.',
      },
    ]);
    expect(world.controller.state().kind).toBe('idle');
  });
});
