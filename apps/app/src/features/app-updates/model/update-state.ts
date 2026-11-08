import type { AppUpdateSummary } from '@smarteverything/domain';
import type { UpdateFailureCause } from './adapter';

export type RunningVersion =
  | {
      readonly kind: 'update';
      readonly id: string;
      readonly createdAt: string;
      readonly appVersion: string | null;
    }
  | { readonly kind: 'embedded'; readonly builtAt: string | null };

export type NewAppKind = 'apk' | 'installer';

export type RestartTarget =
  { readonly kind: 'update'; readonly offer: AppUpdateSummary } | { readonly kind: 'built_in' };

export const BUILT_IN_TARGET: RestartTarget = { kind: 'built_in' };

export type AppUpdateState =
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | {
      readonly kind: 'up_to_date';
      readonly running: RunningVersion | null;
      readonly checkedAt: string;
    }
  | { readonly kind: 'available'; readonly offer: AppUpdateSummary }
  | { readonly kind: 'downloading'; readonly offer: AppUpdateSummary; readonly progress: number }
  | { readonly kind: 'ready'; readonly target: RestartTarget }
  | { readonly kind: 'waiting_for_call'; readonly target: RestartTarget }
  | { readonly kind: 'restarting'; readonly target: RestartTarget }
  | { readonly kind: 'needs_new_app'; readonly newer: AppUpdateSummary; readonly app: NewAppKind }
  | {
      readonly kind: 'failed';
      readonly cause: UpdateFailureCause;
      readonly reason: string;
      readonly offer: AppUpdateSummary | null;
      readonly target: RestartTarget | null;
      readonly retrying: boolean;
      readonly sequence: number;
    }
  | {
      readonly kind: 'rolled_back';
      readonly failedId: string | null;
      readonly reason: string;
      readonly retrying: boolean;
    };

export interface CheckOutcome {
  readonly compatible: AppUpdateSummary | null;
  readonly newer: AppUpdateSummary | null;
  readonly rollBackToEmbedded: boolean;
}

export type AppUpdateEvent =
  | { readonly type: 'unsupported'; readonly reason: string }
  | { readonly type: 'check_started'; readonly manual: boolean }
  | {
      readonly type: 'checked';
      readonly manual: boolean;
      readonly outcome: CheckOutcome;
      readonly running: RunningVersion | null;
      readonly at: string;
      readonly app: NewAppKind;
    }
  | {
      readonly type: 'failed';
      readonly cause: UpdateFailureCause;
      readonly reason: string;
      readonly offer: AppUpdateSummary | null;
      readonly target: RestartTarget | null;
      readonly sequence: number;
    }
  | {
      readonly type: 'check_failed';
      readonly manual: boolean;
      readonly reason: string;
      readonly sequence: number;
    }
  | { readonly type: 'rolled_back'; readonly failedId: string | null; readonly reason: string }
  | { readonly type: 'retry_started' }
  | { readonly type: 'download_started'; readonly offer: AppUpdateSummary }
  | {
      readonly type: 'download_progress';
      readonly offer: AppUpdateSummary;
      readonly progress: number;
    }
  | { readonly type: 'downloaded'; readonly offer: AppUpdateSummary; readonly busy: boolean }
  | { readonly type: 'rollback_ready'; readonly busy: boolean }
  | { readonly type: 'busy_changed'; readonly busy: boolean }
  | { readonly type: 'restart_requested'; readonly busy: boolean };

type DownloadEvent = Extract<
  AppUpdateEvent,
  {
    readonly type:
      | 'download_started'
      | 'download_progress'
      | 'downloaded'
      | 'rollback_ready'
      | 'busy_changed'
      | 'restart_requested';
  }
>;

const DOWNLOAD_EVENTS: ReadonlySet<AppUpdateEvent['type']> = new Set([
  'download_started',
  'download_progress',
  'downloaded',
  'rollback_ready',
  'busy_changed',
  'restart_requested',
]);

function isDownloadEvent(event: AppUpdateEvent): event is DownloadEvent {
  return DOWNLOAD_EVENTS.has(event.type);
}

export const INITIAL_UPDATE_STATE: AppUpdateState = { kind: 'idle' };

const CHECKING: AppUpdateState = { kind: 'checking' };

const HOLDING: ReadonlySet<AppUpdateState['kind']> = new Set([
  'unsupported',
  'downloading',
  'ready',
  'waiting_for_call',
  'restarting',
]);

export function holdsUpdate(state: AppUpdateState): boolean {
  return HOLDING.has(state.kind) || (state.kind === 'failed' && state.target !== null);
}

type Problem = Extract<AppUpdateState, { readonly kind: 'failed' | 'rolled_back' }>;

function isProblem(state: AppUpdateState): state is Problem {
  return state.kind === 'failed' || state.kind === 'rolled_back';
}

export function restartTargetOf(state: AppUpdateState): RestartTarget | null {
  return 'target' in state ? state.target : null;
}

export function offerOf(state: AppUpdateState): AppUpdateSummary | null {
  const target = restartTargetOf(state);
  if (target !== null) return target.kind === 'update' ? target.offer : null;
  return 'offer' in state ? state.offer : null;
}

export function restartableTargetOf(state: AppUpdateState): RestartTarget | null {
  return state.kind === 'ready' || state.kind === 'waiting_for_call' || state.kind === 'failed'
    ? restartTargetOf(state)
    : null;
}

function checkStarted(state: AppUpdateState, manual: boolean): AppUpdateState {
  if (holdsUpdate(state)) return state;
  if (state.kind === 'idle') return CHECKING;
  if (!manual) return state;
  if (isProblem(state)) return { ...state, retrying: true };
  return state.kind === 'available' ? state : CHECKING;
}

function isSameProblem(state: AppUpdateState, id: AppUpdateSummary['id']): boolean {
  if (state.kind === 'rolled_back') return state.failedId === id;
  return state.kind === 'failed' && state.offer?.id === id;
}

function checked(
  state: AppUpdateState,
  event: Extract<AppUpdateEvent, { readonly type: 'checked' }>,
): AppUpdateState {
  if (holdsUpdate(state)) return state;
  const { compatible, newer } = event.outcome;
  if (compatible !== null) {
    return !event.manual && isSameProblem(state, compatible.id)
      ? state
      : { kind: 'available', offer: compatible };
  }
  if (!event.manual && isProblem(state)) return state;
  if (newer !== null) return { kind: 'needs_new_app', newer, app: event.app };
  return { kind: 'up_to_date', running: event.running, checkedAt: event.at };
}

function restartRequested(state: AppUpdateState, busy: boolean): AppUpdateState {
  const target = restartTargetOf(state);
  if (target === null || state.kind === 'restarting') return state;
  return busy ? { kind: 'waiting_for_call', target } : { kind: 'restarting', target };
}

function heldFor(target: RestartTarget, busy: boolean): AppUpdateState {
  return { kind: busy ? 'waiting_for_call' : 'ready', target };
}

function reduceDownload(state: AppUpdateState, event: DownloadEvent): AppUpdateState {
  switch (event.type) {
    case 'download_started':
      return { kind: 'downloading', offer: event.offer, progress: 0 };
    case 'download_progress':
      return { kind: 'downloading', offer: event.offer, progress: event.progress };
    case 'downloaded':
      return heldFor({ kind: 'update', offer: event.offer }, event.busy);
    case 'rollback_ready':
      return heldFor(BUILT_IN_TARGET, event.busy);
    case 'busy_changed':
      return state.kind === 'waiting_for_call' && !event.busy
        ? { kind: 'ready', target: state.target }
        : state;
    case 'restart_requested':
      return restartRequested(state, event.busy);
  }
}

function checkFailed(
  state: AppUpdateState,
  event: Extract<AppUpdateEvent, { readonly type: 'check_failed' }>,
): AppUpdateState {
  if (!event.manual && state.kind !== 'checking') return state;
  return {
    kind: 'failed',
    cause: 'check',
    reason: event.reason,
    offer: null,
    target: null,
    retrying: false,
    sequence: event.sequence,
  };
}

export function reduceAppUpdate(state: AppUpdateState, event: AppUpdateEvent): AppUpdateState {
  if (isDownloadEvent(event)) return reduceDownload(state, event);
  switch (event.type) {
    case 'unsupported':
      return { kind: 'unsupported', reason: event.reason };
    case 'check_started':
      return checkStarted(state, event.manual);
    case 'checked':
      return checked(state, event);
    case 'failed':
      return {
        kind: 'failed',
        cause: event.cause,
        reason: event.reason,
        offer: event.offer,
        target: event.target,
        retrying: false,
        sequence: event.sequence,
      };
    case 'check_failed':
      return checkFailed(state, event);
    case 'rolled_back':
      return {
        kind: 'rolled_back',
        failedId: event.failedId,
        reason: event.reason,
        retrying: false,
      };
    case 'retry_started':
      return isProblem(state) ? { ...state, retrying: true } : state;
  }
}

export interface BusyState {
  readonly aiCall: boolean;
  readonly cameraCall: boolean;
  readonly walkie: boolean;
}

export function canRestartNow(busy: BusyState): boolean {
  return !busy.aiCall && !busy.cameraCall && !busy.walkie;
}
