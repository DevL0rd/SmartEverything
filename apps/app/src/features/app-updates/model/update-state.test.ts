import { describe, expect, it } from 'vitest';
import type { AppUpdateSummary, WebUpdateStatus } from '@smarteverything/domain';
import { checkOutcomeOf, startOf } from '../data/desktop-updates';
import { bannerOf, offerViewOf } from './update-copy';
import {
  BUILT_IN_TARGET,
  INITIAL_UPDATE_STATE,
  canRestartNow,
  holdsUpdate,
  offerOf,
  reduceAppUpdate,
  type AppUpdateEvent,
  type AppUpdateState,
  type CheckOutcome,
} from './update-state';

const OFFER: AppUpdateSummary = {
  id: '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11',
  createdAt: '2026-10-24T10:00:00.000Z',
  appVersion: '1.4.0',
  notes: 'Faster camera start\nMore details',
  size: 2_097_152,
};

const NEWER: AppUpdateSummary = { ...OFFER, id: 'a1b2c3d4-0000-4000-8000-000000000001' };

type Checked = Extract<AppUpdateEvent, { readonly type: 'checked' }>;

const FAILED_DOWNLOAD = {
  type: 'failed',
  cause: 'download',
  reason: 'Disk full',
  offer: OFFER,
  target: null,
  sequence: 1,
} as const;

const UP_TO_DATE: AppUpdateState = {
  kind: 'up_to_date',
  running: null,
  checkedAt: OFFER.createdAt,
};

const READY = { kind: 'ready', target: { kind: 'update', offer: OFFER } } as const;

function checked(
  outcome: Omit<CheckOutcome, 'rollBackToEmbedded'> & Partial<CheckOutcome>,
  extra: Partial<Omit<Checked, 'type'>> = {},
): Checked {
  return {
    type: 'checked',
    manual: false,
    outcome: { rollBackToEmbedded: false, ...outcome },
    running: { kind: 'embedded', builtAt: '2026-10-20T08:00:00.000Z' },
    at: '2026-10-25T09:00:00.000Z',
    app: 'apk',
    ...extra,
  };
}

function run(events: readonly AppUpdateEvent[], from = INITIAL_UPDATE_STATE): AppUpdateState {
  return events.reduce(reduceAppUpdate, from);
}

describe('the app update reducer', () => {
  it('walks the Android path from check to restart', () => {
    const states = [
      { type: 'check_started', manual: true },
      checked({ compatible: OFFER, newer: null }),
      { type: 'download_started', offer: OFFER },
      { type: 'download_progress', offer: OFFER, progress: 0.5 },
      { type: 'downloaded', offer: OFFER, busy: false },
      { type: 'restart_requested', busy: false },
    ] as const satisfies readonly AppUpdateEvent[];
    const kinds = states.map((_, index) => run(states.slice(0, index + 1)).kind);
    expect(kinds).toEqual([
      'checking',
      'available',
      'downloading',
      'downloading',
      'ready',
      'restarting',
    ]);
  });

  it('walks the desktop path from bridge statuses', () => {
    const idle: WebUpdateStatus = {
      state: 'idle',
      running: { id: 'embedded', createdAt: '2026-10-20T08:00:00.000Z' },
    };
    expect(startOf(idle)).toEqual({
      kind: 'started',
      runtimeVersion: null,
      running: { kind: 'embedded', builtAt: '2026-10-20T08:00:00.000Z' },
      emergency: null,
    });
    const available: WebUpdateStatus = { state: 'available', offer: { ...OFFER, files: [] } };
    const state = run([
      checked(checkOutcomeOf(available), { app: 'installer' }),
      { type: 'download_started', offer: OFFER },
      { type: 'downloaded', offer: OFFER, busy: false },
    ]);
    expect(state).toEqual(READY);
    const installer = run([
      checked(checkOutcomeOf({ state: 'needs_installer', newer: NEWER }), { app: 'installer' }),
    ]);
    expect(installer).toEqual({ kind: 'needs_new_app', newer: NEWER, app: 'installer' });
    expect(startOf({ state: 'disabled', reason: 'Development build' })).toEqual({
      kind: 'unsupported',
      reason: 'Development build',
    });
  });

  it('waits for the call to end before the restart', () => {
    const waiting = run([
      checked({ compatible: OFFER, newer: null }),
      { type: 'download_started', offer: OFFER },
      { type: 'downloaded', offer: OFFER, busy: true },
    ]);
    expect(waiting.kind).toBe('waiting_for_call');
    expect(run([{ type: 'restart_requested', busy: true }], waiting).kind).toBe('waiting_for_call');
    expect(run([{ type: 'busy_changed', busy: false }], waiting)).toEqual(READY);
  });

  it('readies a return to the built-in version and waits for a call like an update', () => {
    const ready = run([{ type: 'rollback_ready', busy: false }]);
    expect(ready).toEqual({ kind: 'ready', target: BUILT_IN_TARGET });
    expect(offerOf(ready)).toBeNull();
    const waiting = run([{ type: 'rollback_ready', busy: true }]);
    expect(waiting).toEqual({ kind: 'waiting_for_call', target: BUILT_IN_TARGET });
    expect(run([{ type: 'busy_changed', busy: false }], waiting)).toEqual(ready);
    expect(run([{ type: 'restart_requested', busy: false }], ready).kind).toBe('restarting');
  });

  it('keeps a rolled back update out of background checks only', () => {
    const rolledBack = run([{ type: 'rolled_back', failedId: OFFER.id, reason: 'Crashed' }]);
    const background = run(
      [{ type: 'check_started', manual: false }, checked({ compatible: OFFER, newer: null })],
      rolledBack,
    );
    expect(background).toBe(rolledBack);
    const other = run([checked({ compatible: NEWER, newer: null })], rolledBack);
    expect(other).toEqual({ kind: 'available', offer: NEWER });
    const manual = run(
      [
        { type: 'check_started', manual: true },
        checked({ compatible: OFFER, newer: null }, { manual: true }),
      ],
      rolledBack,
    );
    expect(manual).toEqual({ kind: 'available', offer: OFFER });
  });

  it('starts idle and shows checking only once a check begins', () => {
    expect(INITIAL_UPDATE_STATE).toEqual({ kind: 'idle' });
    expect(run([{ type: 'check_started', manual: false }]).kind).toBe('checking');
    expect(run([{ type: 'check_started', manual: false }], UP_TO_DATE)).toBe(UP_TO_DATE);
    expect(run([{ type: 'check_started', manual: true }], UP_TO_DATE).kind).toBe('checking');
  });

  it('marks a failed or rolled back notice busy instead of hiding it while it retries', () => {
    const failed = run([FAILED_DOWNLOAD]);
    const busy = run([{ type: 'check_started', manual: true }], failed);
    expect(busy).toEqual({ ...failed, retrying: true });
    expect(run([{ type: 'retry_started' }], failed)).toEqual({ ...failed, retrying: true });
    const rolledBack = run([{ type: 'rolled_back', failedId: OFFER.id, reason: 'Crashed' }]);
    expect(run([{ type: 'retry_started' }], rolledBack)).toMatchObject({ retrying: true });
    expect(run([{ type: 'retry_started' }], UP_TO_DATE)).toBe(UP_TO_DATE);
  });

  it('keeps the target of a failed restart and restarts it again without a download', () => {
    const failed = run([
      {
        type: 'failed',
        cause: 'restart',
        reason: 'Offline',
        offer: OFFER,
        target: READY.target,
        sequence: 2,
      },
    ]);
    expect(holdsUpdate(failed)).toBe(true);
    expect(offerOf(failed)).toBe(OFFER);
    expect(
      run(
        [{ type: 'check_started', manual: true }, checked({ compatible: NEWER, newer: null })],
        failed,
      ),
    ).toBe(failed);
    expect(run([{ type: 'restart_requested', busy: false }], failed)).toEqual({
      kind: 'restarting',
      target: READY.target,
    });
    expect(run([{ type: 'restart_requested', busy: true }], failed).kind).toBe('waiting_for_call');
    expect(holdsUpdate(run([FAILED_DOWNLOAD]))).toBe(false);
  });

  it('keeps a failed download notice when a background check finds the same offer', () => {
    const failed = run([FAILED_DOWNLOAD]);
    expect(run([checked({ compatible: OFFER, newer: null })], failed)).toBe(failed);
    expect(run([checked({ compatible: NEWER, newer: null })], failed).kind).toBe('available');
  });

  it('names a newer app as its own state', () => {
    const state = run([checked({ compatible: null, newer: NEWER }, { app: 'installer' })]);
    expect(state).toEqual({ kind: 'needs_new_app', newer: NEWER, app: 'installer' });
  });

  it('ignores checks while an update is held', () => {
    const ready = run([
      checked({ compatible: OFFER, newer: null }),
      { type: 'downloaded', offer: OFFER, busy: false },
    ]);
    expect(
      run(
        [{ type: 'check_started', manual: true }, checked({ compatible: null, newer: null })],
        ready,
      ),
    ).toBe(ready);
  });

  it('shows a failed background check only when nothing else is known', () => {
    const failed = run([
      { type: 'check_started', manual: false },
      { type: 'check_failed', manual: false, reason: 'Home offline', sequence: 1 },
    ]);
    expect(failed).toEqual({
      kind: 'failed',
      cause: 'check',
      reason: 'Home offline',
      offer: null,
      target: null,
      retrying: false,
      sequence: 1,
    });
    expect(bannerOf(failed)).toBeNull();
    expect(offerViewOf(failed).title).toBe('Couldn’t check for updates');
    const available = run([checked({ compatible: OFFER, newer: null })]);
    expect(
      run([{ type: 'check_failed', manual: false, reason: 'x', sequence: 2 }], available),
    ).toBe(available);
  });
});

it('allows a restart only when no call or walkie is active', () => {
  expect(canRestartNow({ aiCall: false, cameraCall: false, walkie: false })).toBe(true);
  expect(canRestartNow({ aiCall: true, cameraCall: false, walkie: false })).toBe(false);
  expect(canRestartNow({ aiCall: false, cameraCall: true, walkie: false })).toBe(false);
  expect(canRestartNow({ aiCall: false, cameraCall: false, walkie: true })).toBe(false);
});
