import { describe, expect, it, vi } from 'vitest';
import { progressPercent } from '../../../components/update-progress';
import { askToRestart, pendingRestart, settleRestart } from '../data/restart-confirmation';
import type { AppUpdateView } from '../data/update-controller';
import type { AppUpdateActions } from '../data/update-store';
import { bannerOf, ROLLBACK_CONFIRM } from '../model/update-copy';
import { offerDetailsFooter } from './offer-notice';
import { offerPress } from './update-banner';
import { UPDATE_FIXTURES } from './update-fixtures';

vi.mock('../data/android-apk', () => ({ useAndroidApkOffer: vi.fn() }));
vi.mock('../data/desktop-installer', () => ({ useDesktopInstaller: vi.fn() }));

function fakeActions(): AppUpdateActions {
  return { check: vi.fn(), download: vi.fn(), retry: vi.fn(), restart: vi.fn() };
}

function fixture(name: string): AppUpdateView {
  const view = UPDATE_FIXTURES[name];
  if (view === undefined) throw new Error(`No fixture ${name}`);
  return view;
}

function shown(name: string): NonNullable<ReturnType<typeof bannerOf>> {
  const offer = bannerOf(fixture(name).state);
  if (offer === null) throw new Error(`No banner for ${name}`);
  return offer;
}

describe('the app update banner', () => {
  it('shows a banner for every state the design lists and none for the quiet ones', () => {
    const names = Object.entries(UPDATE_FIXTURES)
      .filter(([, view]) => bannerOf(view.state) !== null)
      .map(([name]) => name);
    expect(names).toEqual([
      'available',
      'downloading',
      'ready',
      'waiting_for_call',
      'withdrawn',
      'withdrawn_waiting_for_call',
      'failed',
      'retrying',
      'restart_failed',
      'rolled_back',
    ]);
  });

  it('downloads the offer the person saw when they press Update', () => {
    const actions = fakeActions();
    const offer = shown('available');
    offerPress(offer, actions)?.();
    expect(actions.download).toHaveBeenCalledExactlyOnceWith(offer.offerId);
  });

  it('restarts the downloaded offer directly from Restart', () => {
    const actions = fakeActions();
    const offer = shown('ready');
    offerPress(offer, actions)?.();
    expect(actions.restart).toHaveBeenCalledExactlyOnceWith(offer.offerId, undefined);
  });

  it('resumes the failed step from Try again and offers nothing while it runs', () => {
    const actions = fakeActions();
    offerPress(shown('failed'), actions)?.();
    expect(actions.retry).toHaveBeenCalledExactlyOnceWith(shown('failed').offerId);
    expect(offerPress(shown('retrying'), actions)).toBeUndefined();
    expect(offerDetailsFooter(shown('retrying'), undefined)).toEqual({
      kind: 'status',
      label: 'The download stopped: the hub went offline.',
    });
  });

  it('checks again after a rollback without naming the failed offer', () => {
    const actions = fakeActions();
    offerPress(shown('rolled_back'), actions)?.();
    expect(actions.retry).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('opens the Details action with the same verb as the banner', () => {
    const footer = offerDetailsFooter(shown('available'), vi.fn());
    expect(footer).toMatchObject({ kind: 'action', actionId: 'update', label: 'Update' });
    expect(offerDetailsFooter(shown('downloading'), undefined)).toEqual({
      kind: 'status',
      label: 'Downloading update',
      progress: 0.42,
    });
  });

  it('resolves inline restart confirmation only for its current prompt', async () => {
    const first = askToRestart(ROLLBACK_CONFIRM);
    const stale = pendingRestart.get();
    const second = askToRestart(ROLLBACK_CONFIRM);
    const current = pendingRestart.get();
    await expect(first).resolves.toBe(false);
    expect(current?.request.cancelLabel).toBe('Later');
    settleRestart(stale, true);
    expect(pendingRestart.get()).toBe(current);
    settleRestart(current, true);
    await expect(second).resolves.toBe(true);
    expect(pendingRestart.get()).toBeNull();
  });

  it('reports the progress as a whole percent', () => {
    expect(progressPercent(0.426)).toBe(43);
    expect(progressPercent(1)).toBe(100);
  });
});
