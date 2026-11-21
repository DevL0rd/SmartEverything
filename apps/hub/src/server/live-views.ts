import type { LiveChange, LiveMessage } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { storeUnit } from '../store/host/unit';
import { driveNoticeView, projected, seenBy, type Hearing, type LiveView } from './live-visibility';

export type LiveViewJob =
  | { readonly kind: 'change'; readonly change: LiveChange; readonly hearers: readonly number[] }
  | { readonly kind: 'seen'; readonly message: LiveMessage; readonly hearers: readonly number[] }
  | { readonly kind: 'drive'; readonly message: LiveMessage; readonly hearers: readonly number[] }
  | {
      readonly kind: 'profile';
      readonly message: LiveMessage;
      readonly profileId: string;
      readonly hearers: readonly number[];
    };

export interface LiveViewsInput {
  readonly hearers: readonly Hearing[];
  readonly jobs: readonly LiveViewJob[];
}

export class LiveHearerError extends Error {
  override readonly name = 'LiveHearerError';

  constructor(readonly index: number) {
    super(`The live view names hearer ${String(index)}, which the batch does not carry.`);
  }
}

function hearerAt(hearers: readonly Hearing[], index: number): Hearing {
  const hearer = hearers[index];
  if (hearer === undefined) throw new LiveHearerError(index);
  return hearer;
}

function profileView(profileId: string): LiveView {
  return (connection, message, store) =>
    store.profiles.activeOf(connection.client.id).id === profileId
      ? seenBy(connection, message, store)
      : null;
}

function viewOf(job: Exclude<LiveViewJob, { kind: 'change' }>): LiveView {
  if (job.kind === 'drive') return driveNoticeView();
  if (job.kind === 'profile') return profileView(job.profileId);
  return seenBy;
}

export const SAME_VIEW = 'same';

export type LiveViewOf = LiveMessage | null | typeof SAME_VIEW;

function sameOr(source: LiveMessage, shown: LiveMessage | null): LiveViewOf {
  return shown === source ? SAME_VIEW : shown;
}

function jobViews(store: Store, hearers: readonly Hearing[], job: LiveViewJob): LiveViewOf[] {
  if (job.kind === 'change') {
    return job.hearers.map((index) =>
      sameOr(job.change, projected(hearerAt(hearers, index), job.change, store)),
    );
  }
  const view = viewOf(job);
  return job.hearers.map((index) =>
    sameOr(job.message, view(hearerAt(hearers, index), job.message, store)),
  );
}

export const LIVE_VIEWS_UNIT = storeUnit(
  (store, { hearers, jobs }: LiveViewsInput): LiveViewOf[][] =>
    jobs.map((job) => jobViews(store, hearers, job)),
);

export const ACTIVE_PROFILE_UNIT = storeUnit(
  (store, clientId: string): string => store.profiles.activeOf(clientId).id,
);
