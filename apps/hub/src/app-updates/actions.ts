import {
  latestAppUpdate,
  type AppUpdateChannel,
  type AppUpdateEntry,
  type AppUpdateIndex,
  type AppUpdatePlatform,
} from '@smarteverything/domain';
import { verifyNextOffer } from './candidate';
import type { IndexChange } from './store';

export class UpdateNotFoundError extends Error {
  override readonly name = 'UpdateNotFoundError';

  constructor(readonly id: string) {
    super(`No update entry has the id ${id}; list shows the ids that exist`);
  }
}

export class UpdateWithdrawnError extends Error {
  override readonly name = 'UpdateWithdrawnError';

  constructor(
    readonly id: string,
    readonly action: string,
    reason: string,
  ) {
    super(`The update ${id} cannot be used to ${action}: it was withdrawn (${reason})`);
  }
}

export class UpdateTargetedPromotionError extends Error {
  override readonly name = 'UpdateTargetedPromotionError';

  constructor(readonly id: string) {
    super(`Device-only test ${id} cannot be promoted; publish a new compatible release instead`);
  }
}

export class NothingToRollBackError extends Error {
  override readonly name = 'NothingToRollBackError';

  constructor(
    readonly platform: AppUpdatePlatform,
    readonly channel: AppUpdateChannel,
  ) {
    super(
      `The ${platform} ${channel} channel has no entry that is not withdrawn, so nothing can be rolled back`,
    );
  }
}

export class ClockBehindError extends Error {
  override readonly name = 'ClockBehindError';

  constructor(
    readonly newest: string,
    readonly now: string,
  ) {
    super(
      `A republished entry must be newer than the withdrawn entry created at ${newest}, but the time now is ${now}; clients only move forward in time`,
    );
  }
}

export interface Moment {
  readonly id: string;
  readonly now: Date;
}

export interface Touched {
  readonly entries: AppUpdateEntry[];
}

function findEntry(index: AppUpdateIndex, id: string): AppUpdateEntry {
  const found = index.entries.find((entry) => entry.id === id);
  if (found === undefined) throw new UpdateNotFoundError(id);
  return found;
}

function replaceEntries(
  index: AppUpdateIndex,
  replacements: readonly AppUpdateEntry[],
  added: readonly AppUpdateEntry[],
): AppUpdateIndex {
  const byId = new Map(replacements.map((entry) => [entry.id, entry]));
  return { entries: [...index.entries.map((entry) => byId.get(entry.id) ?? entry), ...added] };
}

function withdrawnAt(entry: AppUpdateEntry, now: Date, reason: string): AppUpdateEntry {
  return { ...entry, withdrawn: { at: now.toISOString(), reason } };
}

function copyAt(entry: AppUpdateEntry, moment: Moment, channel: AppUpdateChannel): AppUpdateEntry {
  return {
    ...entry,
    id: moment.id,
    channel,
    createdAt: moment.now.toISOString(),
    withdrawn: null,
  };
}

export function promoteEntry(
  index: AppUpdateIndex,
  request: { readonly id: string; readonly channel: AppUpdateChannel },
  moment: Moment,
): IndexChange<Touched> {
  const source = findEntry(index, request.id);
  if (source.clientId !== undefined) throw new UpdateTargetedPromotionError(source.id);
  if (source.withdrawn !== null) {
    throw new UpdateWithdrawnError(source.id, 'promote', source.withdrawn.reason);
  }
  const copy = copyAt(source, moment, request.channel);
  const latest = latestAppUpdate(index.entries, copy);
  if (latest !== null && moment.now.getTime() <= Date.parse(latest.createdAt)) {
    throw new ClockBehindError(latest.createdAt, moment.now.toISOString());
  }
  verifyNextOffer(index, copy);
  return { index: replaceEntries(index, [], [copy]), result: { entries: [copy] } };
}

export interface RollbackRequest {
  readonly platform: AppUpdatePlatform;
  readonly channel: AppUpdateChannel;
  readonly reason: string;
  readonly toEmbedded: boolean;
}

function newestOf(entries: readonly AppUpdateEntry[]): AppUpdateEntry | null {
  return entries.reduce<AppUpdateEntry | null>(
    (best, entry) =>
      best === null || Date.parse(entry.createdAt) > Date.parse(best.createdAt) ? entry : best,
    null,
  );
}

interface Retirement {
  readonly withdrawing: readonly AppUpdateEntry[];
  readonly previous: AppUpdateEntry | null;
  readonly newest: AppUpdateEntry;
  readonly reason: string;
  readonly clientId?: string | undefined;
}

function retire(
  index: AppUpdateIndex,
  { withdrawing, previous, newest, reason, clientId }: Retirement,
  moment: Moment,
): IndexChange<Touched> {
  const withdrawn = withdrawing.map((entry) => withdrawnAt(entry, moment.now, reason));
  if (previous === null) {
    return { index: replaceEntries(index, withdrawn, []), result: { entries: withdrawn } };
  }
  if (moment.now.getTime() <= Date.parse(newest.createdAt)) {
    throw new ClockBehindError(newest.createdAt, moment.now.toISOString());
  }
  const republished = {
    ...copyAt(previous, moment, previous.channel),
    ...(clientId === undefined ? {} : { clientId }),
  };
  return {
    index: replaceEntries(index, withdrawn, [republished]),
    result: { entries: [...withdrawn, republished] },
  };
}

export function rollbackEntries(
  index: AppUpdateIndex,
  request: RollbackRequest,
  moment: Moment,
): IndexChange<Touched> {
  const live = index.entries.filter(
    (entry) =>
      entry.withdrawn === null &&
      entry.clientId === undefined &&
      entry.platform === request.platform &&
      entry.channel === request.channel,
  );
  const newest = newestOf(live);
  if (newest === null) throw new NothingToRollBackError(request.platform, request.channel);
  const sameRuntime = live.filter((entry) => entry.runtimeVersion === newest.runtimeVersion);
  const previous = request.toEmbedded
    ? null
    : newestOf(sameRuntime.filter((entry) => entry.id !== newest.id));
  return retire(
    index,
    {
      withdrawing: request.toEmbedded ? sameRuntime : [newest],
      previous,
      newest,
      reason: request.reason,
    },
    moment,
  );
}

export function withdrawEntry(
  index: AppUpdateIndex,
  request: { readonly id: string; readonly reason: string },
  moment: Moment,
): IndexChange<Touched> {
  const source = findEntry(index, request.id);
  if (source.withdrawn !== null) {
    throw new UpdateWithdrawnError(source.id, 'withdraw again', source.withdrawn.reason);
  }
  const sameRuntime = index.entries.filter(
    (entry) =>
      entry.withdrawn === null &&
      (entry.clientId === undefined || entry.clientId === source.clientId) &&
      entry.platform === source.platform &&
      entry.channel === source.channel &&
      entry.runtimeVersion === source.runtimeVersion,
  );
  if (newestOf(sameRuntime)?.id !== source.id) {
    const withdrawn = withdrawnAt(source, moment.now, request.reason);
    return { index: replaceEntries(index, [withdrawn], []), result: { entries: [withdrawn] } };
  }
  return retire(
    index,
    {
      withdrawing: [source],
      previous: newestOf(sameRuntime.filter((entry) => entry.id !== source.id)),
      newest: source,
      reason: request.reason,
      clientId: source.clientId,
    },
    moment,
  );
}
