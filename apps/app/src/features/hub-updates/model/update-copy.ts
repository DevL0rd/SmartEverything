import {
  hubUpdateFinished,
  type HubUpdateAcceptance,
  type ReleaseArtifact,
  type ReleaseSource,
  type ReleaseUpload,
  type HubUpdateSourceCheck,
  type HubUpdateSourceStart,
  type HubUpdateRecoveryResult,
  type HubUpdateRecoveryStatus,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

const SHORT_COMMIT = 8;

type Release = NonNullable<HubUpdateRecoveryStatus['release']>;
type Refusal = Extract<HubUpdateRecoveryResult, { status: 'refused' }>['refusal'];

export const PHASE_LABEL: Readonly<Record<Release['phase'], string>> = {
  planned: 'Preparing the hub update',
  built: 'Hub update built',
  backed_up: 'Hub backup saved',
  applying: 'Installing the hub update',
  verifying: 'Verifying the hub update',
  restarting: 'Restarting the hub',
  done: 'Hub update complete',
  failed: 'Hub update failed',
  awaiting_decision: 'Hub update failed and waits for your decision',
  kept: 'Failed hub update kept as it is',
  reverted: 'Previous hub version restored',
  unrecoverable: 'Hub recovery needs attention',
};

export const RECOVERY_REFUSAL: Readonly<Record<Refusal, string>> = {
  not_found: 'This release could not be found.',
  busy: 'An update or recovery is already running.',
  not_recoverable: 'This release is no longer available for recovery.',
  unavailable: 'Recovery is unavailable on this hub.',
};

export const ROLLBACK_REFUSAL: Readonly<Record<Refusal, string>> = {
  not_found: 'This release could not be found.',
  busy: 'An update or roll back is already running.',
  not_recoverable: 'This release can no longer be rolled back.',
  unavailable: 'Rolling back is unavailable on this hub.',
};

export const KEEP_REFUSAL: Readonly<Record<Refusal, string>> = {
  not_found: 'This release could not be found.',
  busy: 'An update or recovery is already running.',
  not_recoverable: 'This release is no longer waiting for a decision.',
  unavailable: 'Keeping is unavailable on this hub.',
};

type StartRefusal = Extract<HubUpdateAcceptance, { status: 'refused' }>['refusal'];

export const SOURCE_START_REFUSAL: Readonly<Record<StartRefusal, string>> = {
  busy: 'An update is already running. Check the latest release below.',
  identity_same: 'This snapshot matches the version already running.',
  failed: 'The release couldn’t start. Check for updates again and review the latest release.',
};

export const SOURCE_RELATION_LABEL: Readonly<Record<HubUpdateSourceCheck['relation'], string>> = {
  same: 'Local and remote commits match',
  remote_ahead: 'New commits on the remote branch',
  local_ahead: 'Local commits are ahead of the remote branch',
  diverged: 'Local and remote branches have different commits',
  unknown: 'Couldn’t compare the full commit history',
};

const SOURCE_BLOCKED: Readonly<
  Record<NonNullable<HubUpdateSourceCheck['applyBlockedBy']>, string>
> = {
  owner_required: 'Only the owner can install this hub update.',
  unsupported_host: 'Installing Hub updates requires a Linux hub with a systemd user service.',
  checkout_conflicts: 'Resolve the conflicting files in the hub checkout before updating.',
  checkout_not_ancestor: 'The hub checkout has commits outside the configured branch.',
  tracked_branch_required: 'Switch the hub checkout to its configured branch before updating.',
};

export function sourceBlockedReason(source: HubUpdateSourceCheck): string | null {
  return source.applyBlockedBy === undefined ? null : SOURCE_BLOCKED[source.applyBlockedBy];
}

export function sourceReleaseRequest(
  source: HubUpdateSourceCheck,
  offerId: string,
): HubUpdateSourceStart {
  const { staged, unstaged, untracked } = source.pending;
  return { offerId, requestId: offerId, includePending: staged + unstaged + untracked > 0 };
}

export interface ReleaseNotice {
  readonly tone: 'info' | 'warning';
  readonly title: string;
}

export const DECISION_PHASES: ReadonlySet<Release['phase']> = new Set([
  'awaiting_decision',
  'unrecoverable',
]);

export function waitsForDecision(release: Pick<Release, 'phase'>): boolean {
  return DECISION_PHASES.has(release.phase);
}

function recoveryTitle(release: Release): string | null {
  if (waitsForDecision(release)) return PHASE_LABEL[release.phase];
  return release.interrupted && release.finishedAt === null ? 'Hub update interrupted' : null;
}

export interface ReleaseOutcome {
  readonly id: string;
  readonly notice: ReleaseNotice;
}

export function releaseOutcomeOf(release: Release | null | undefined): ReleaseOutcome | null {
  if (release === null || release === undefined || !hubUpdateFinished(release)) return null;
  if (recoveryTitle(release) !== null) return null;
  return {
    id: JSON.stringify([release.runId, release.phase, release.finishedAt]),
    notice: {
      tone: release.phase === 'failed' || release.phase === 'kept' ? 'warning' : 'info',
      title: PHASE_LABEL[release.phase],
    },
  };
}

export function releaseNoticeOf(
  latest: Release | null | undefined,
  starting: boolean,
  live: boolean,
): ReleaseNotice | null {
  const release = latest ?? null;
  const warning = release === null ? null : recoveryTitle(release);
  if (warning !== null) return { tone: 'warning', title: warning };
  const phase = release === null || hubUpdateFinished(release) ? null : release.phase;
  if (!starting && phase === null) return null;
  if (!live) return { tone: 'info', title: 'Waiting for the hub to reconnect' };
  return { tone: 'info', title: phase === null ? 'Starting hub update…' : PHASE_LABEL[phase] };
}

export const ARTIFACT_LOOK: Readonly<
  Record<ReleaseArtifact, { readonly name: string; readonly icon: IconName }>
> = {
  hub: { name: 'Hub service', icon: 'server' },
  apk: { name: 'Android app', icon: 'smartphone' },
  ui: { name: 'Over the air', icon: 'download' },
  desktop: { name: 'Desktop app', icon: 'monitor' },
};

export const SOURCE_LABEL: Readonly<Record<ReleaseSource, string>> = {
  provided: 'Provided',
  github: 'GitHub',
  hub: 'Hub',
};

export const SOURCE_DETAIL: Readonly<Record<ReleaseSource, string>> = {
  provided: 'Built on a dev machine and uploaded to the hub',
  github: 'Downloaded from a GitHub release',
  hub: 'Built on the hub machine',
};

export function gitSourceNote(source: ReleaseSource): string {
  return `The hub service comes from ${source === 'github' ? 'GitHub releases' : 'provided builds'}, so the hub never builds this branch. Set its build source to Hub to release from here.`;
}

export const DECISION_COPY = {
  rollback: {
    title: 'Roll back the hub?',
    body: 'The hub restores the backup of the previous version and restarts.',
    confirmLabel: 'Roll back',
  },
  retry: {
    title: 'Try this release again?',
    body: 'The hub installs the same build again, checks it and may restart.',
    confirmLabel: 'Try again',
  },
  keep: {
    title: 'Keep this version?',
    body: 'Nothing is restored and the backup stays. The release counts as finished, so new hub updates can start again. Rolling back or trying again is no longer offered for it afterwards.',
    confirmLabel: 'Keep',
  },
} as const;

const DECISION_REFUSAL = {
  rollback: ROLLBACK_REFUSAL,
  retry: RECOVERY_REFUSAL,
  keep: KEEP_REFUSAL,
} as const;

export function decisionResultLine(
  choice: 'rollback' | 'retry' | 'keep',
  result: HubUpdateRecoveryResult | undefined,
): string {
  if (result?.status === 'refused') return DECISION_REFUSAL[choice][result.refusal];
  if (result?.status === 'started' && choice === 'keep')
    return 'Kept. The hub update is finished and its backup stays.';
  return result?.status === 'started'
    ? 'Started. The hub may restart, then this card shows the result.'
    : 'Couldn’t reach the hub. Refresh status before trying again.';
}

const UNIT = ['B', 'KB', 'MB', 'GB'] as const;
const STEP = 1024;

export function byteSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= STEP && unit < UNIT.length - 1) {
    value /= STEP;
    unit += 1;
  }
  return `${unit === 0 ? String(value) : value.toFixed(1)} ${UNIT[unit] ?? 'GB'}`;
}

export function uploadProgress(upload: ReleaseUpload): number {
  return upload.state === 'staged' ? 1 : Math.min(1, upload.receivedBytes / upload.size);
}

export function uploadLine(upload: ReleaseUpload): string {
  if (upload.release === null)
    return `Receiving · ${byteSize(upload.receivedBytes)} of ${byteSize(upload.size)}`;
  const { version, commit, target } = upload.release;
  return `${version} · ${commit.slice(0, SHORT_COMMIT)} · ${target} · ${byteSize(upload.release.bytes)}`;
}
