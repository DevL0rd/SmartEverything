import type { AppUpdateSummary } from '@smarteverything/domain';
import { moment, shortDate } from '../../../format/time';
import {
  OFFER_TITLE,
  QUIET_OFFER,
  offerAction,
  releaseCopy,
  type OfferTone,
  type ReleaseOffer,
} from './release-offer';
import type { UpdateFailureCause } from './adapter';
import {
  holdsUpdate,
  restartTargetOf,
  type AppUpdateState,
  type RestartTarget,
  type RunningVersion,
} from './update-state';

export const ROLLBACK_CONFIRM = {
  title: 'Restart to go back to the built-in version?',
  body: 'SmartEverything closes and opens again in a few seconds.',
  confirmLabel: 'Restart',
  cancelLabel: 'Later',
} as const;

export const WAITING_SENTENCE = 'SmartEverything restarts by itself when your call ends.';

export const DESKTOP_RESTART_PENDING_HINT = 'Answer the desktop update prompt first.';

export const WITHDRAWN_SENTENCE =
  'This update was withdrawn. Restart to go back to the version built into the app.';

export const ROLLED_BACK_SENTENCE = 'SmartEverything went back to the version that worked.';

export function runningLabel(running: RunningVersion | null): string {
  if (running === null) return 'Version not reported yet';
  if (running.kind === 'embedded') {
    return running.builtAt === null ? 'Built in' : `Built in (from ${shortDate(running.builtAt)})`;
  }
  const date = shortDate(running.createdAt);
  return running.appVersion === null ? `Update from ${date}` : `${running.appVersion} · ${date}`;
}

function quiet(
  key: string,
  tone: OfferTone,
  title: string,
  sentence: string | null = null,
): ReleaseOffer {
  return { ...QUIET_OFFER, key, tone, title, sentence };
}

function released(
  key: string,
  offer: AppUpdateSummary,
  shown: Pick<ReleaseOffer, 'tone' | 'title'> & Partial<ReleaseOffer>,
): ReleaseOffer {
  return {
    ...QUIET_OFFER,
    key: `${key}:${offer.id}`,
    offerId: offer.id,
    ...releaseCopy(offer),
    ...shown,
  };
}

function withdrawnOffer(kind: 'ready' | 'waiting_for_call' | 'restarting'): ReleaseOffer {
  return {
    ...quiet(`withdrawn:${kind}`, 'warning', OFFER_TITLE.withdrawn),
    sentence: kind === 'waiting_for_call' ? WAITING_SENTENCE : WITHDRAWN_SENTENCE,
    action: kind === 'ready' ? offerAction('restart') : null,
    dismissible: kind === 'ready',
  };
}

function heldOffer(
  kind: 'ready' | 'waiting_for_call' | 'restarting',
  target: RestartTarget,
): ReleaseOffer {
  if (target.kind === 'built_in') return withdrawnOffer(kind);
  if (kind === 'restarting')
    return released(kind, target.offer, { tone: 'info', title: OFFER_TITLE.restarting });
  const waiting = kind === 'waiting_for_call';
  return released(kind, target.offer, {
    tone: 'info',
    title: waiting ? OFFER_TITLE.waiting : OFFER_TITLE.ready,
    sentence: waiting ? WAITING_SENTENCE : null,
    action: waiting ? null : offerAction('restart'),
    dismissible: !waiting,
  });
}

const FAILED_TITLE: Readonly<Record<UpdateFailureCause, string>> = {
  check: OFFER_TITLE.checkFailed,
  download: OFFER_TITLE.downloadFailed,
  restart: OFFER_TITLE.restartFailed,
  launch: OFFER_TITLE.launchFailed,
};

function failedOffer(state: Extract<AppUpdateState, { readonly kind: 'failed' }>): ReleaseOffer {
  const shown = {
    tone: 'critical',
    title: FAILED_TITLE[state.cause],
    sentence: state.reason,
    action: offerAction(state.cause === 'launch' ? 'check' : 'retry', state.retrying),
    dismissible: true,
  } as const;
  const base =
    state.offer === null
      ? { ...quiet('failed', 'critical', shown.title), ...shown }
      : released('failed', state.offer, shown);
  return { ...base, key: `failed:${String(state.sequence)}` };
}

function newAppOffer(
  state: Extract<AppUpdateState, { readonly kind: 'needs_new_app' }>,
): ReleaseOffer {
  return released('needs_new_app', state.newer, {
    tone: 'info',
    title: 'A newer app is available',
    sentence:
      state.app === 'apk'
        ? 'Install the new Android app to keep getting updates.'
        : 'Install the new desktop app to keep getting updates.',
  });
}

function rolledBackOffer(
  state: Extract<AppUpdateState, { readonly kind: 'rolled_back' }>,
): ReleaseOffer {
  return {
    ...quiet(`rolled_back:${state.failedId ?? ''}`, 'critical', OFFER_TITLE.launchFailed),
    sentence: `${ROLLED_BACK_SENTENCE} ${state.reason}`,
    action: offerAction('check', state.retrying),
    dismissible: true,
  };
}

type IdleKind = 'unsupported' | 'idle' | 'checking' | 'up_to_date' | 'needs_new_app';

type IdleState = Extract<AppUpdateState, { readonly kind: IdleKind }>;

type ActiveState = Exclude<AppUpdateState, { readonly kind: IdleKind }>;

const IDLE_KINDS: ReadonlySet<AppUpdateState['kind']> = new Set<IdleKind>([
  'unsupported',
  'idle',
  'checking',
  'up_to_date',
  'needs_new_app',
]);

function isIdle(state: AppUpdateState): state is IdleState {
  return IDLE_KINDS.has(state.kind);
}

function activeOffer(state: ActiveState): ReleaseOffer {
  switch (state.kind) {
    case 'available':
      return released('available', state.offer, {
        tone: 'info',
        title: OFFER_TITLE.available,
        action: offerAction('update'),
        dismissible: true,
      });
    case 'downloading':
      return released('downloading', state.offer, {
        tone: 'info',
        title: OFFER_TITLE.downloading,
        progress: state.progress,
      });
    case 'ready':
    case 'waiting_for_call':
    case 'restarting':
      return heldOffer(state.kind, state.target);
    case 'failed':
      return failedOffer(state);
    case 'rolled_back':
      return rolledBackOffer(state);
  }
}

function idleOffer(state: IdleState): ReleaseOffer {
  switch (state.kind) {
    case 'unsupported':
      return quiet(state.kind, 'info', 'Over-the-air updates are unavailable', state.reason);
    case 'checking':
      return quiet(state.kind, 'info', 'Checking for updates…');
    case 'up_to_date':
      return quiet(state.kind, 'positive', 'You’re up to date');
    case 'needs_new_app':
      return newAppOffer(state);
    case 'idle':
      return quiet(state.kind, 'info', 'Updates haven’t been checked yet');
  }
}

export function offerViewOf(state: AppUpdateState): ReleaseOffer {
  return isIdle(state) ? idleOffer(state) : activeOffer(state);
}

export function bannerOf(state: AppUpdateState): ReleaseOffer | null {
  if (isIdle(state) || state.kind === 'restarting') return null;
  return state.kind === 'failed' && state.cause === 'check' ? null : activeOffer(state);
}

export interface CheckRow {
  readonly subtitle: string;
  readonly disabled: boolean;
}

const LOOK_NOW = 'Checks for an update for this device';

function heldSubtitle(state: AppUpdateState): string {
  if (state.kind === 'downloading') return 'Downloading an update now';
  if (state.kind === 'restarting') return 'Restarting now';
  return restartTargetOf(state)?.kind === 'built_in'
    ? 'Restart to go back to the built-in version first'
    : 'An update is ready. Restart to finish it first';
}

export function checkRowOf(state: AppUpdateState, checking: boolean, now: number): CheckRow {
  if (checking) return { subtitle: 'Checking for updates…', disabled: true };
  if (state.kind !== 'unsupported' && holdsUpdate(state))
    return { subtitle: heldSubtitle(state), disabled: true };
  if (state.kind === 'up_to_date')
    return { subtitle: `Last checked ${moment(state.checkedAt, now)}`, disabled: false };
  return { subtitle: LOOK_NOW, disabled: false };
}
