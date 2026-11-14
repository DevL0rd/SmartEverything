import {
  hubUpdateFinished,
  type HubUpdateAcceptance,
  type HubUpdateSourceCheck,
  type HubUpdateSourceStart,
  type SelfUpdateRecoveryResult,
  type SelfUpdateRecoveryStatus,
} from '@smarteverything/domain';

type Release = NonNullable<SelfUpdateRecoveryStatus['release']>;
type Refusal = Extract<SelfUpdateRecoveryResult, { status: 'refused' }>['refusal'];

export const PHASE_LABEL: Readonly<Record<Release['phase'], string>> = {
  planned: 'Preparing the hub update',
  built: 'Hub update built',
  backed_up: 'Hub backup saved',
  applying: 'Installing the hub update',
  verifying: 'Verifying the hub update',
  restarting: 'Restarting the hub',
  done: 'Hub update complete',
  failed: 'Hub update failed',
  reverting: 'Restoring the previous hub version',
  reverted: 'Previous hub version restored',
  unrecoverable: 'Hub recovery needs attention',
};

export const RECOVERY_REFUSAL: Readonly<Record<Refusal, string>> = {
  not_found: 'This release could not be found.',
  busy: 'An update or recovery is already running.',
  not_recoverable: 'This release is no longer available for recovery.',
  unavailable: 'Recovery is unavailable on this hub.',
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

function recoveryTitle(release: Release): string | null {
  if (release.interrupted && release.finishedAt === null) return 'Hub update interrupted';
  return release.phase === 'unrecoverable' ? PHASE_LABEL.unrecoverable : null;
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
      tone: release.phase === 'failed' ? 'warning' : 'info',
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
