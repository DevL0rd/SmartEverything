import type {
  PipelineComponent,
  UpdateRevision,
  UpdateRevisionStatus,
  UpdateRevisionStep,
} from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import type { IconName } from '../../../components/icon';

const SHORT_COMMIT_LENGTH = 8;

export type StepState =
  | 'queued'
  | 'running'
  | 'done'
  | 'offered'
  | 'failed'
  | 'rolled_back'
  | 'rollback_failed'
  | 'superseded'
  | 'not_run';

export interface Look {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: IconName;
}

export interface StepView {
  readonly component: PipelineComponent;
  readonly name: string;
  readonly icon: IconName;
  readonly state: StepState;
  readonly look: Look;
}

export interface RevisionView {
  readonly id: string;
  readonly commit: string;
  readonly range: string | null;
  readonly headline: string | null;
  readonly look: Look;
  readonly steps: readonly StepView[];
  readonly waiting: string | null;
  readonly failure: string | null;
  readonly rollback: string | null;
  readonly at: string;
}

export const COMPONENT: Readonly<
  Record<PipelineComponent, { readonly name: string; readonly icon: IconName }>
> = {
  hub: { name: 'Hub', icon: 'server' },
  app: { name: 'Android app', icon: 'smartphone' },
  desktop: { name: 'Desktop app', icon: 'monitor' },
  ui: { name: 'Over the air', icon: 'download' },
};

export const STEP_LOOK: Readonly<Record<StepState, Look>> = {
  queued: { label: 'Queued', tone: 'neutral', icon: 'clock' },
  running: { label: 'Running', tone: 'primary', icon: 'loader' },
  done: { label: 'Done', tone: 'positive', icon: 'circleCheck' },
  offered: { label: 'Offered', tone: 'positive', icon: 'circleCheck' },
  failed: { label: 'Failed', tone: 'critical', icon: 'circleX' },
  rolled_back: { label: 'Rolled back', tone: 'warning', icon: 'undo' },
  rollback_failed: { label: 'Rollback failed', tone: 'critical', icon: 'alert' },
  superseded: { label: 'Superseded', tone: 'neutral', icon: 'layers' },
  not_run: { label: 'Not run', tone: 'neutral', icon: 'ban' },
};

export const REVISION_LOOK: Readonly<Record<UpdateRevisionStatus, Look>> = {
  queued: { label: 'Queued', tone: 'neutral', icon: 'clock' },
  running: { label: 'Releasing', tone: 'primary', icon: 'loader' },
  done: { label: 'Released', tone: 'positive', icon: 'circleCheck' },
  failed: { label: 'Failed', tone: 'critical', icon: 'circleX' },
  refused: { label: 'Refused', tone: 'warning', icon: 'ban' },
  superseded: { label: 'Superseded', tone: 'neutral', icon: 'layers' },
};

const ROLLBACK_LINE = {
  none: null,
  reverted: 'Rolled back: the previous Hub version is running again.',
  unrecoverable: 'The rollback did not finish. Recover the Hub from the Hub card on Updates.',
} as const;

function failedState(revision: UpdateRevision, step: UpdateRevisionStep): StepState {
  if (revision.failure?.component !== step.component) return 'failed';
  if (revision.failure.rollback === 'reverted') return 'rolled_back';
  return revision.failure.rollback === 'unrecoverable' ? 'rollback_failed' : 'failed';
}

export function stepState(revision: UpdateRevision, step: UpdateRevisionStep): StepState {
  switch (step.status) {
    case 'pending':
      return 'queued';
    case 'running':
      return 'running';
    case 'done':
      return step.offered ? 'offered' : 'done';
    case 'failed':
      return failedState(revision, step);
    case 'skipped':
      return revision.status === 'superseded' ? 'superseded' : 'not_run';
  }
}

export function noteHeadline(notes: string | null): string | null {
  const line = notes
    ?.split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ?? null;
}

export function shortCommit(commit: string): string {
  return commit.slice(0, SHORT_COMMIT_LENGTH);
}

function waitingLine(revision: UpdateRevision): string | null {
  if (revision.steps.length > 0) return null;
  if (revision.status === 'queued') return 'Waiting for the current release to finish.';
  if (revision.status === 'running') return 'Working out what this push needs to release.';
  if (revision.status === 'superseded')
    return 'A newer push arrived first, so that one is released instead.';
  if (revision.status === 'done') return 'Nothing in this push needed a release.';
  return null;
}

function failureLine(revision: UpdateRevision): string | null {
  const failure = revision.failure;
  if (failure === null) return null;
  return failure.component === null
    ? failure.message
    : `${COMPONENT[failure.component].name}: ${failure.message}`;
}

function rangeOf(revision: UpdateRevision): string | null {
  const from = revision.base ?? revision.pushedFrom;
  return from === null ? null : `${shortCommit(from)} → ${shortCommit(revision.tip)}`;
}

export function revisionView(revision: UpdateRevision): RevisionView {
  return {
    id: revision.id,
    commit: shortCommit(revision.tip),
    range: rangeOf(revision),
    headline: noteHeadline(revision.notes),
    look: REVISION_LOOK[revision.status],
    steps: revision.steps.map((step) => {
      const state = stepState(revision, step);
      return {
        component: step.component,
        ...COMPONENT[step.component],
        state,
        look: STEP_LOOK[state],
      };
    }),
    waiting: waitingLine(revision),
    failure: failureLine(revision),
    rollback: revision.failure === null ? null : ROLLBACK_LINE[revision.failure.rollback],
    at: revision.finishedAt ?? revision.updatedAt,
  };
}

export const NAS_SETUP_COMMAND =
  'cd ~/Github/SmartEverything && ~/.local/opt/SmartEverything-Hub/node/bin/node --import tsx tooling/configure-update-source.ts --checkout "$HOME/Github/SmartEverything"';
