import { describe, expect, it, vi } from 'vitest';
import { UpdateFailure } from '../model/adapter';
import type { CheckOutcome } from '../model/update-state';
import { FOUND, OFFER, deferCheck, noticeFor, setup, settle } from './update-controller-world';

describe('the app update controller checks', () => {
  it('starts idle and runs the adapter start only once for concurrent starts', async () => {
    const world = setup();
    expect(world.controller.state().kind).toBe('idle');
    await Promise.all([world.controller.start(), world.controller.start()]);
    await world.controller.check('button');
    expect(world.adapter.start).toHaveBeenCalledTimes(1);
  });

  it('shows checking only while a check runs and then the offer', async () => {
    const world = setup();
    const finish = deferCheck(world);
    const checking = world.controller.check('live');
    await settle();
    expect(world.controller.state().kind).toBe('checking');
    finish(FOUND);
    await checking;
    expect(world.controller.state()).toEqual({ kind: 'available', offer: OFFER });
  });

  it('ignores a notice for another runtime and checks for its own', async () => {
    const world = setup();
    await world.controller.start();
    world.controller.receiveNotice(noticeFor(OFFER.id, 'runtime-b'));
    await settle();
    expect(world.adapter.check).not.toHaveBeenCalled();
    world.controller.receiveNotice(noticeFor(OFFER.id));
    await settle();
    expect(world.adapter.check).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['published', FOUND, 'available'],
    ['withdrawn', { compatible: null, newer: null, rollBackToEmbedded: false }, 'up_to_date'],
  ] as const)('checks again when a release is %s during an older check', async (_, fresh, kind) => {
    const world = setup();
    await world.controller.start();
    let finishInitial: (outcome: CheckOutcome) => void = () => undefined;
    const initial = new Promise<CheckOutcome>((resolve) => {
      finishInitial = resolve;
    });
    vi.mocked(world.adapter.check).mockReturnValueOnce(initial).mockResolvedValueOnce(fresh);
    const checking = world.controller.check('live');
    const notice = noticeFor(fresh.compatible?.id ?? null);
    world.controller.receiveNotice(notice);
    world.controller.receiveNotice(notice);
    expect(world.adapter.check).toHaveBeenCalledTimes(1);
    finishInitial({
      compatible: fresh.compatible === null ? OFFER : null,
      newer: null,
      rollBackToEmbedded: false,
    });
    await checking;
    expect(world.adapter.check).toHaveBeenCalledTimes(2);
    expect(world.controller.state().kind).toBe(kind);
  });

  it('runs a follow-up manual check when the button joins a background check', async () => {
    const world = setup();
    await world.controller.start();
    const finish = deferCheck(world);
    const background = world.controller.check('live');
    await settle();
    const manual = world.controller.check('button');
    expect(world.adapter.check).toHaveBeenCalledTimes(1);
    vi.mocked(world.adapter.check).mockRejectedValueOnce(
      new UpdateFailure('check', 'The app couldn’t check for updates. Try again.', 'offline'),
    );
    finish({ compatible: null, newer: null, rollBackToEmbedded: false });
    await Promise.all([background, manual]);
    expect(world.adapter.check).toHaveBeenCalledTimes(2);
    expect(world.controller.state()).toMatchObject({
      kind: 'failed',
      cause: 'check',
      reason: 'The app couldn’t check for updates. Try again.',
    });
  });

  it('keeps a failed background check silent once an answer is known', async () => {
    const world = setup({ outcome: { compatible: null, newer: null, rollBackToEmbedded: false } });
    await world.controller.check('live');
    vi.mocked(world.adapter.check).mockRejectedValueOnce(new Error('offline'));
    await world.controller.check('notice');
    expect(world.controller.state().kind).toBe('up_to_date');
  });

  it('shows a failed first check with a plain sentence and no internal detail', async () => {
    const world = setup();
    vi.mocked(world.adapter.check).mockRejectedValueOnce(new Error('ECONNRESET 10.0.0.4'));
    await world.controller.check('live');
    const state = world.controller.state();
    expect(state).toMatchObject({ kind: 'failed', cause: 'check', target: null, offer: null });
    expect(JSON.stringify(state)).not.toContain('ECONNRESET');
  });

  it('shows a failed check when the updater cannot start and starts it again on Try again', async () => {
    const world = setup();
    vi.mocked(world.adapter.start).mockRejectedValueOnce(new Error('Updater missing'));
    await world.controller.start();
    expect(world.controller.state()).toMatchObject({ kind: 'failed', cause: 'check' });
    await world.controller.retry();
    expect(world.adapter.start).toHaveBeenCalledTimes(2);
    expect(world.controller.state()).toEqual({ kind: 'available', offer: OFFER });
  });

  it('keeps the failed notice and marks it busy while Try again checks', async () => {
    const world = setup();
    vi.mocked(world.adapter.check).mockRejectedValueOnce(new Error('offline'));
    await world.controller.check('button');
    const finish = deferCheck(world);
    const retrying = world.controller.retry();
    await settle();
    expect(world.controller.state()).toMatchObject({ kind: 'failed', retrying: true });
    finish(FOUND);
    await retrying;
    expect(world.controller.state().kind).toBe('available');
  });

  it('gives a repeated failure a new sequence number', async () => {
    const world = setup();
    vi.mocked(world.adapter.check).mockRejectedValue(new Error('offline'));
    await world.controller.check('button');
    const first = world.controller.state();
    await world.controller.retry();
    const second = world.controller.state();
    if (first.kind !== 'failed' || second.kind !== 'failed') throw new Error('Expected failures.');
    expect(second.sequence).toBeGreaterThan(first.sequence);
  });

  it('checks and restarts on the release feed with a saved Test preference', async () => {
    const world = setup({ prefs: { channel: 'dev' } });
    await world.controller.check('button');
    await world.controller.download(OFFER.id);
    await settle();
    expect(world.adapter.check).toHaveBeenCalledWith({ channel: 'release' });
    expect(world.adapter.restart).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'release' }),
    );
    expect(world.prefs().pendingId).toBe(OFFER.id);
  });

  it('never writes the token or a bearer header when a check fails', async () => {
    const lines: string[] = [];
    const sink = vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const world = setup();
    vi.mocked(world.adapter.check).mockRejectedValueOnce(
      new Error('Headers {"authorization":"Bearer token"} rejected'),
    );
    await world.controller.start();
    await world.controller.check('button');
    sink.mockRestore();
    const failed = lines.filter((line) => line.includes('app_update.check_failed'));
    expect(failed).toHaveLength(1);
    expect(failed.join('\n')).not.toMatch(/bearer|\btoken\b/i);
  });
});
