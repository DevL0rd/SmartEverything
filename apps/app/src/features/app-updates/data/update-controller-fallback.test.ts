import { describe, expect, it, vi } from 'vitest';
import type { FallbackControls } from '../model/adapter';
import { fallbackChoiceOf, offerViewOf } from '../model/update-copy';
import { FOUND, OFFER, setup, settle } from './update-controller-world';

const CRASHED = {
  kind: 'started',
  running: { kind: 'embedded', builtAt: null },
  runtimeVersion: 'runtime-a',
  emergency: { failedId: null, reason: 'The update crashed on start' },
} as const;

const BUILT_IN = {
  kind: 'started',
  running: { kind: 'embedded', builtAt: null },
  runtimeVersion: 'runtime-a',
  emergency: null,
} as const;

function controls(): FallbackControls {
  return {
    keepBuiltIn: vi.fn(() => Promise.resolve()),
    relaunch: vi.fn(() => Promise.resolve()),
  };
}

describe('the app update controller after the update fell back to the built-in bundle', () => {
  it('reports the crashed update, keeps the built-in bundle and waits for a decision', async () => {
    const fallback = controls();
    const world = setup({ start: CRASHED, fallback, prefs: { launchedId: OFFER.id } });
    await world.controller.start();
    await settle();
    expect(world.controller.state()).toMatchObject({
      kind: 'fell_back',
      failedId: OFFER.id,
      deciding: false,
    });
    expect(world.reports).toEqual([
      { updateId: OFFER.id, outcome: 'fell_back', reason: 'The update crashed on start' },
    ]);
    expect(world.recorded()).toEqual({ updateId: OFFER.id, reason: 'The update crashed on start' });
    expect(world.prefs()).toMatchObject({ pendingId: null, launchedId: null });
    expect(fallback.keepBuiltIn).toHaveBeenCalledTimes(1);
    expect(fallback.relaunch).not.toHaveBeenCalled();
    const offer = offerViewOf(world.controller.state());
    expect(offer).toMatchObject({ tone: 'critical', dismissible: false });
    expect(offer.sentence).toContain(`Update ${OFFER.id}`);
    expect(offer.action?.label).toBe('Try the update again');
    expect(fallbackChoiceOf(world.controller.state())?.label).toBe('Stay on the built-in version');
  });

  it('treats an approved update that is not running after the restart as a fall back', async () => {
    const world = setup({
      start: BUILT_IN,
      fallback: controls(),
      prefs: { pendingId: OFFER.id, launchedId: OFFER.id },
    });
    await world.controller.start();
    expect(world.controller.state()).toMatchObject({ kind: 'fell_back', failedId: OFFER.id });
    expect(world.reports).toEqual([
      expect.objectContaining({ updateId: OFFER.id, outcome: 'fell_back' }),
    ]);
  });

  it('keeps showing the decision on every start until the owner chooses, and does not check', async () => {
    const world = setup({
      start: BUILT_IN,
      fallback: controls(),
      recorded: { updateId: OFFER.id, reason: 'The update crashed on start' },
    });
    await world.controller.start();
    await world.controller.check('paired');
    expect(world.controller.state()).toMatchObject({ kind: 'fell_back', failedId: OFFER.id });
    expect(world.adapter.check).not.toHaveBeenCalled();
    expect(world.reports).toEqual([
      { updateId: OFFER.id, outcome: 'fell_back', reason: 'The update crashed on start' },
    ]);
  });

  it('relaunches the same update when the owner tries it again', async () => {
    const fallback = controls();
    const world = setup({ start: CRASHED, fallback, prefs: { launchedId: OFFER.id } });
    await world.controller.start();
    await world.controller.tryUpdateAgain();
    expect(fallback.relaunch).toHaveBeenCalledExactlyOnceWith(OFFER.id);
    expect(world.prefs()).toMatchObject({ pendingId: OFFER.id, launchedId: OFFER.id });
    expect(world.recorded()).toBeNull();
  });

  it('keeps the decision when the relaunch fails', async () => {
    const fallback = controls();
    vi.mocked(fallback.relaunch).mockRejectedValueOnce(new Error('reload refused'));
    const world = setup({ start: CRASHED, fallback, prefs: { launchedId: OFFER.id } });
    await world.controller.start();
    await world.controller.tryUpdateAgain();
    expect(world.controller.state()).toMatchObject({ kind: 'fell_back', deciding: false });
    expect(world.recorded()).toMatchObject({ updateId: OFFER.id });
    expect(world.prefs()).toMatchObject({ pendingId: null, launchedId: null });
  });

  it('stays on the built-in version, tells the hub and checks again', async () => {
    const fallback = controls();
    const world = setup({ start: CRASHED, fallback, prefs: { launchedId: OFFER.id } });
    await world.controller.start();
    await world.controller.stayOnBuiltIn();
    expect(world.recorded()).toBeNull();
    expect(world.reports.at(-1)).toEqual({
      updateId: OFFER.id,
      outcome: 'kept_built_in',
      reason: null,
    });
    expect(fallback.keepBuiltIn).toHaveBeenCalledTimes(2);
    expect(fallback.relaunch).not.toHaveBeenCalled();
    expect(world.adapter.check).toHaveBeenCalledTimes(1);
    expect(world.controller.state()).toEqual({ kind: 'available', offer: FOUND.compatible });
  });

  it('shows a rollback on a platform that has no fall back controls', async () => {
    const world = setup({ start: CRASHED, prefs: { launchedId: OFFER.id } });
    await world.controller.start();
    expect(world.controller.state().kind).toBe('rolled_back');
    expect(world.recorded()).toBeNull();
  });
});
