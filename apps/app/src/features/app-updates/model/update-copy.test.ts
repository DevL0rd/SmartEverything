import { describe, expect, it } from 'vitest';
import type { AppUpdateSummary } from '@smarteverything/domain';
import { bannerOf, checkRowOf, offerViewOf, runningLabel } from './update-copy';
import { BUILT_IN_TARGET, type AppUpdateState } from './update-state';

const OFFER: AppUpdateSummary = {
  id: '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11',
  createdAt: '2026-10-24T10:00:00.000Z',
  appVersion: '1.4.0',
  notes: 'Faster camera start\nMore details',
  size: 2_097_152,
};

const READY: AppUpdateState = { kind: 'ready', target: { kind: 'update', offer: OFFER } };

function failed(
  cause: Extract<AppUpdateState, { readonly kind: 'failed' }>['cause'],
  change: Partial<Extract<AppUpdateState, { readonly kind: 'failed' }>> = {},
): AppUpdateState {
  return {
    kind: 'failed',
    cause,
    reason: 'The update couldn’t be downloaded. Try again.',
    offer: OFFER,
    target: null,
    retrying: false,
    sequence: 1,
    ...change,
  };
}

const NOW = Date.parse(OFFER.createdAt) + 60_000;

describe('the release offer view', () => {
  it('names one update with one verb and one metadata line', () => {
    const offer = bannerOf({ kind: 'available', offer: OFFER });
    expect(offer).toMatchObject({
      title: 'Update available',
      action: { kind: 'update', label: 'Update', busy: false },
      brief: 'Faster camera start',
      notes: OFFER.notes,
      dismissible: true,
      key: `available:${OFFER.id}`,
    });
    expect(offer?.meta).toMatch(/^Version 1\.4\.0 · .+ · /u);
    expect(offer?.meta).not.toContain('Faster camera start');
  });

  it('restarts a downloaded update directly and says a call holds it', () => {
    expect(bannerOf(READY)).toMatchObject({
      title: 'Update ready',
      action: { kind: 'restart', label: 'Restart' },
    });
    expect(bannerOf({ kind: 'waiting_for_call', target: READY.target })).toMatchObject({
      title: 'Updating after your call',
      sentence: 'SmartEverything restarts by itself when your call ends.',
      action: null,
    });
    expect(bannerOf({ kind: 'downloading', offer: OFFER, progress: 0.42 })).toMatchObject({
      title: 'Downloading update',
      progress: 0.42,
      action: null,
      dismissible: false,
    });
  });

  it('explains a withdrawn update and restarts only when asked', () => {
    expect(bannerOf({ kind: 'ready', target: BUILT_IN_TARGET })).toMatchObject({
      tone: 'warning',
      title: 'Update withdrawn',
      action: { kind: 'restart' },
    });
    expect(bannerOf({ kind: 'waiting_for_call', target: BUILT_IN_TARGET })?.action).toBeNull();
  });

  it.each([
    ['download', 'Update didn’t download', 'retry'],
    ['restart', 'Update couldn’t restart', 'retry'],
    ['launch', 'Update couldn’t start', 'check'],
  ] as const)('titles a %s failure by its cause', (cause, title, action) => {
    expect(bannerOf(failed(cause))).toMatchObject({
      tone: 'critical',
      title,
      sentence: 'The update couldn’t be downloaded. Try again.',
      action: { kind: action },
      dismissible: true,
    });
  });

  it('shows a restart failure without an offer in the banner', () => {
    expect(bannerOf(failed('restart', { offer: null, target: BUILT_IN_TARGET }))?.title).toBe(
      'Update couldn’t restart',
    );
  });

  it('keeps a check failure out of the shell and in Settings', () => {
    const state = failed('check', { offer: null });
    expect(bannerOf(state)).toBeNull();
    expect(offerViewOf(state).title).toBe('Couldn’t check for updates');
  });

  it('keeps the failed notice with a busy action while it retries', () => {
    expect(bannerOf(failed('download', { retrying: true }))?.action).toEqual({
      kind: 'retry',
      label: 'Try again',
      busy: true,
    });
  });

  it('keys each failure by its sequence so a repeat failure shows again', () => {
    expect(bannerOf(failed('download'))?.key).not.toBe(
      bannerOf(failed('download', { sequence: 2 }))?.key,
    );
  });

  it('offers a check after a rollback instead of a blind retry', () => {
    expect(
      bannerOf({ kind: 'rolled_back', failedId: OFFER.id, reason: 'It closed.', retrying: false }),
    ).toMatchObject({
      title: 'Update couldn’t start',
      sentence: 'SmartEverything went back to the version that worked. It closed.',
      action: { kind: 'check', label: 'Check for updates' },
    });
  });

  it('never says there is no update when a newer app is needed', () => {
    const state: AppUpdateState = { kind: 'needs_new_app', newer: OFFER, app: 'apk' };
    expect(bannerOf(state)).toBeNull();
    expect(offerViewOf(state)).toMatchObject({
      title: 'A newer app is available',
      sentence: 'Install the new Android app to keep getting updates.',
    });
  });

  it('shows the quiet states only on the Settings card', () => {
    const quiet: readonly AppUpdateState[] = [
      { kind: 'idle' },
      { kind: 'checking' },
      { kind: 'up_to_date', running: null, checkedAt: OFFER.createdAt },
      { kind: 'restarting', target: READY.target },
      { kind: 'unsupported', reason: 'Not here' },
    ];
    expect(quiet.map(bannerOf)).toEqual(quiet.map(() => null));
    expect(quiet.map((state) => offerViewOf(state).title)).toEqual([
      'Updates haven’t been checked yet',
      'Checking for updates…',
      'You’re up to date',
      'Restarting to update',
      'Over-the-air updates are unavailable',
    ]);
  });
});

describe('the Check for updates row', () => {
  it('tells when it last checked', () => {
    const row = checkRowOf(
      { kind: 'up_to_date', running: null, checkedAt: OFFER.createdAt },
      false,
      NOW,
    );
    expect(row.disabled).toBe(false);
    expect(row.subtitle).toMatch(/^Last checked today /u);
  });

  it('is disabled with the reason while an update is held', () => {
    expect(checkRowOf(READY, false, NOW)).toEqual({
      subtitle: 'An update is ready. Restart to finish it first',
      disabled: true,
    });
    expect(checkRowOf({ kind: 'waiting_for_call', target: BUILT_IN_TARGET }, false, NOW)).toEqual({
      subtitle: 'Restart to go back to the built-in version first',
      disabled: true,
    });
    expect(checkRowOf({ kind: 'downloading', offer: OFFER, progress: 0.1 }, false, NOW)).toEqual({
      subtitle: 'Downloading an update now',
      disabled: true,
    });
  });

  it('stays available when over-the-air updates are unsupported and shows a running check', () => {
    expect(checkRowOf({ kind: 'unsupported', reason: 'Not here' }, false, NOW).disabled).toBe(
      false,
    );
    expect(checkRowOf({ kind: 'idle' }, true, NOW)).toEqual({
      subtitle: 'Checking for updates…',
      disabled: true,
    });
  });
});

it('labels the running version', () => {
  expect(runningLabel({ kind: 'embedded', builtAt: null })).toBe('Built in');
  expect(runningLabel({ kind: 'embedded', builtAt: OFFER.createdAt })).toMatch(
    /^Built in \(from /u,
  );
  expect(
    runningLabel({ kind: 'update', id: OFFER.id, createdAt: OFFER.createdAt, appVersion: '1.4.0' }),
  ).toMatch(/^1\.4\.0 · /u);
});
