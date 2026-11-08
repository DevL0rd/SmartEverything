import type { AppUpdateSummary } from '@smarteverything/domain';
import type { AppUpdateView } from '../data/update-controller';
import type { RunningVersion } from '../model/update-state';

const OFFER: AppUpdateSummary = {
  id: '6f1c2a8e-3b4d-4c5e-8f90-1a2b3c4d5e6f',
  createdAt: '2026-10-24T09:30:00.000Z',
  appVersion: '0.9.4',
  notes: 'Faster camera start and a clearer fitness week.\nSmaller fixes.',
  size: 4_812_000,
};

const RUNNING: RunningVersion = {
  kind: 'update',
  id: '0d9e8f7a-6b5c-4d3e-a2f1-0e9d8c7b6a50',
  createdAt: '2026-10-20T18:00:00.000Z',
  appVersion: '0.9.3',
};

const BUILT_IN: RunningVersion = { kind: 'embedded', builtAt: '2026-10-19T07:00:00.000Z' };

export const UPDATE_FIXTURES: Readonly<Record<string, AppUpdateView>> = {
  unsupported: {
    state: {
      kind: 'unsupported',
      reason: 'Updates over the air are for the Android and desktop apps',
    },
    running: null,
  },
  idle: { state: { kind: 'idle' }, running: BUILT_IN },
  checking: { state: { kind: 'checking' }, running: BUILT_IN },
  up_to_date: {
    state: { kind: 'up_to_date', running: RUNNING, checkedAt: '2026-10-25T08:15:00.000Z' },
    running: RUNNING,
  },
  available: { state: { kind: 'available', offer: OFFER }, running: BUILT_IN },
  downloading: { state: { kind: 'downloading', offer: OFFER, progress: 0.42 }, running: RUNNING },
  ready: { state: { kind: 'ready', target: { kind: 'update', offer: OFFER } }, running: RUNNING },
  waiting_for_call: {
    state: { kind: 'waiting_for_call', target: { kind: 'update', offer: OFFER } },
    running: RUNNING,
  },
  withdrawn: { state: { kind: 'ready', target: { kind: 'built_in' } }, running: RUNNING },
  withdrawn_waiting_for_call: {
    state: { kind: 'waiting_for_call', target: { kind: 'built_in' } },
    running: RUNNING,
  },
  restarting: {
    state: { kind: 'restarting', target: { kind: 'update', offer: OFFER } },
    running: RUNNING,
  },
  needs_new_app_apk: {
    state: { kind: 'needs_new_app', newer: OFFER, app: 'apk' },
    running: RUNNING,
  },
  needs_new_app_installer: {
    state: { kind: 'needs_new_app', newer: OFFER, app: 'installer' },
    running: RUNNING,
  },
  failed: {
    state: {
      kind: 'failed',
      cause: 'download',
      reason: 'The download stopped: the hub went offline.',
      offer: OFFER,
      target: null,
      retrying: false,
      sequence: 1,
    },
    running: RUNNING,
  },
  retrying: {
    state: {
      kind: 'failed',
      cause: 'download',
      reason: 'The download stopped: the hub went offline.',
      offer: OFFER,
      target: null,
      retrying: true,
      sequence: 1,
    },
    running: RUNNING,
  },
  restart_failed: {
    state: {
      kind: 'failed',
      cause: 'restart',
      reason: 'The app couldn’t restart to finish the update. Try again.',
      offer: OFFER,
      target: { kind: 'update', offer: OFFER },
      retrying: false,
      sequence: 2,
    },
    running: RUNNING,
  },
  rolled_back: {
    state: {
      kind: 'rolled_back',
      failedId: OFFER.id,
      reason: 'The update crashed on start.',
      retrying: false,
    },
    running: RUNNING,
  },
};
