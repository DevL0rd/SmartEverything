import { describe, expect, it, vi } from 'vitest';
import {
  OFFER,
  REPLACEMENT,
  deferCheck,
  noticeFor,
  setup,
  settle,
} from './update-controller-world';

describe('the app update controller downloads', () => {
  it('restarts by itself after the download when no call is active', async () => {
    const world = setup();
    await world.controller.check('live');
    await world.controller.download(OFFER.id);
    expect(world.ask).not.toHaveBeenCalled();
    expect(world.adapter.restart).toHaveBeenCalledTimes(1);
    expect(world.controller.state().kind).toBe('restarting');
    expect(world.prefs().pendingId).toBe(OFFER.id);
  });

  it('holds the restart during a call and restarts without asking when it ends', async () => {
    const world = setup();
    await world.controller.check('live');
    world.setBusy(true);
    await world.controller.download(OFFER.id);
    expect(world.controller.state().kind).toBe('waiting_for_call');
    expect(world.adapter.restart).not.toHaveBeenCalled();
    expect(world.prefs().pendingId).toBeNull();
    world.setBusy(false);
    await settle();
    expect(world.ask).not.toHaveBeenCalled();
    expect(world.adapter.restart).toHaveBeenCalledTimes(1);
    expect(world.prefs().pendingId).toBe(OFFER.id);
  });

  it('keeps the offer, cause and a report when a download fails', async () => {
    const world = setup();
    vi.mocked(world.adapter.download).mockRejectedValueOnce(new Error('Disk full'));
    await world.controller.check('live');
    await world.controller.download(OFFER.id);
    expect(world.controller.state()).toMatchObject({
      kind: 'failed',
      cause: 'download',
      offer: OFFER,
      target: null,
      retrying: false,
    });
    expect(world.reports).toEqual([
      { updateId: OFFER.id, outcome: 'download_failed', reason: 'Disk full' },
    ]);
    expect(world.prefs()).toEqual({ channel: 'release', launchedId: null, pendingId: null });
  });

  it('resumes the same download on Try again without checking again', async () => {
    const world = setup();
    vi.mocked(world.adapter.download).mockRejectedValueOnce(new Error('Disk full'));
    await world.controller.check('live');
    await world.controller.download(OFFER.id);
    await world.controller.retry(OFFER.id);
    expect(world.adapter.check).toHaveBeenCalledTimes(1);
    expect(world.adapter.download).toHaveBeenCalledTimes(2);
    expect(world.adapter.restart).toHaveBeenCalledTimes(1);
  });

  it('ignores a Try again for another offer', async () => {
    const world = setup();
    vi.mocked(world.adapter.download).mockRejectedValueOnce(new Error('Disk full'));
    await world.controller.check('live');
    await world.controller.download(OFFER.id);
    await world.controller.retry(REPLACEMENT.id);
    expect(world.adapter.download).toHaveBeenCalledTimes(1);
  });

  it('keeps the failed notice when a background check finds the same offer', async () => {
    const world = setup();
    vi.mocked(world.adapter.download).mockRejectedValueOnce(new Error('Disk full'));
    await world.controller.check('live');
    await world.controller.download(OFFER.id);
    await world.controller.check('notice');
    expect(world.controller.state()).toMatchObject({ kind: 'failed', cause: 'download' });
  });

  it('offers a download failure again to a new session', async () => {
    const world = setup();
    vi.mocked(world.adapter.download).mockRejectedValueOnce(new Error('Disk full'));
    await world.controller.check('live');
    await world.controller.download(OFFER.id);
    const next = setup({ prefs: world.prefs() });
    await next.controller.check('live');
    expect(next.controller.state()).toEqual({ kind: 'available', offer: OFFER });
  });

  it('waits for the trailing notice check before comparing the reviewed offer', async () => {
    const world = setup();
    await world.controller.check('button');
    const finishCheck = deferCheck(world);
    const finishNotice = deferCheck(world);
    const checking = world.controller.check('live');
    const downloading = world.controller.download(OFFER.id);
    const notice = noticeFor(REPLACEMENT.id);
    world.controller.receiveNotice(notice);
    world.controller.receiveNotice(notice);
    expect(world.adapter.download).not.toHaveBeenCalled();
    finishCheck({ compatible: OFFER, newer: null, rollBackToEmbedded: false });
    await settle();
    expect(world.adapter.check).toHaveBeenCalledTimes(3);
    expect(world.adapter.download).not.toHaveBeenCalled();
    finishNotice({ compatible: REPLACEMENT, newer: null, rollBackToEmbedded: false });
    await Promise.all([checking, downloading]);
    expect(world.controller.state()).toEqual({ kind: 'available', offer: REPLACEMENT });
    expect(world.adapter.download).not.toHaveBeenCalled();
    expect(world.reports).toEqual([]);
  });

  it('starts a download only from an offer or a failed download', async () => {
    const world = setup();
    await world.controller.download(OFFER.id);
    expect(world.adapter.download).not.toHaveBeenCalled();
    await world.controller.check('live');
    await world.controller.download(OFFER.id);
    await world.controller.download(OFFER.id);
    expect(world.adapter.download).toHaveBeenCalledTimes(1);
  });
});
