import { isAbsolute } from 'node:path';
import {
  HUB_UPDATE_COMMIT,
  HUB_UPDATE_HOST_PLATFORM,
  HUB_UPDATE_SOURCE_CHECK,
  type HubUpdateSourceCheck,
} from '@smarteverything/domain';
import { z } from 'zod';
import { configuredHubSource, recordHubSourceOffer } from './hub-update-offer.ts';
import { sourceRelations } from './hub-update-source-relation.ts';
import {
  branchRef,
  gitSource,
  HubSourceError,
  inspectHubUpdateSource,
  type SourceOffer,
} from './hub-update-source.ts';

const CONFIG = z.strictObject({
  remote: HUB_UPDATE_SOURCE_CHECK.shape.remote,
  branch: HUB_UPDATE_SOURCE_CHECK.shape.branch,
});

const CHECK_REQUEST = z.strictObject({
  data: z.string().refine(isAbsolute),
  ownerClient: z.uuid().optional(),
  runningTip: HUB_UPDATE_COMMIT.optional(),
  comparisonFolder: z.string().refine(isAbsolute),
});

const CONFLICT_CODES: ReadonlySet<string> = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

function pendingOf(status: string): HubUpdateSourceCheck['pending'] {
  const counts = { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 };
  const entries = status.split('\0');
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry === undefined || entry.length === 0) continue;
    const state = entry.slice(0, 2);
    if (state === '??') {
      counts.untracked++;
      continue;
    }
    if (CONFLICT_CODES.has(state)) {
      counts.conflicts++;
      continue;
    }
    if (!/^[ MADRCT][ MADRCT] /u.test(entry))
      throw new HubSourceError('git', 'Git returned an unsupported pending file state.');
    if (!state.startsWith(' ')) counts.staged++;
    if (state[1] !== ' ') counts.unstaged++;
    if (/[RC]/u.test(state)) index++;
  }
  return counts;
}

async function applyBlockOf(
  offer: SourceOffer,
  relation: HubUpdateSourceCheck['relation'],
  hasConflicts: boolean,
  hasReviewer: boolean,
): Promise<HubUpdateSourceCheck['applyBlockedBy']> {
  if (!hasReviewer) return 'owner_required';
  if (process.platform !== HUB_UPDATE_HOST_PLATFORM) return 'unsupported_host';
  if (hasConflicts) return 'checkout_conflicts';
  if (relation !== 'remote_ahead' && relation !== 'same') return 'checkout_not_ancestor';
  const branch = await gitSource(offer.source.folder, ['symbolic-ref', 'HEAD']);
  return branch.code === 0 && branch.text.trim() === branchRef(offer.source)
    ? undefined
    : 'tracked_branch_required';
}

export async function checkConfiguredSource(
  folder: string,
  settings: { readonly remote: string; readonly branch: string },
  reviewer?: { readonly data: string; readonly client: string },
  context?: { readonly runningTip?: string | undefined; readonly comparisonFolder?: string },
): Promise<HubUpdateSourceCheck> {
  const { offer, status } = await inspectHubUpdateSource({ folder, ...CONFIG.parse(settings) });
  const pending = pendingOf(status);
  const { availableUpdate, checkout, notes, running } = await sourceRelations(offer, {
    ...context,
    includeNotes: reviewer !== undefined,
  });
  const applyBlockedBy =
    availableUpdate === undefined
      ? undefined
      : await applyBlockOf(offer, checkout, pending.conflicts > 0, reviewer !== undefined);
  const offerId =
    availableUpdate !== undefined && applyBlockedBy === undefined && reviewer !== undefined
      ? await recordHubSourceOffer(reviewer.data, reviewer.client, offer)
      : undefined;
  return HUB_UPDATE_SOURCE_CHECK.parse({
    remote: offer.source.remote,
    branch: offer.source.branch,
    head: offer.head,
    tip: offer.tip,
    relation: checkout,
    pending,
    ...(availableUpdate === undefined ? {} : { availableUpdate }),
    ...(applyBlockedBy === undefined ? {} : { applyBlockedBy }),
    ...(offerId === undefined ? {} : { offerId }),
    ...(running === 'same' ? { tipIsRunning: true } : {}),
    ...(notes === undefined ? {} : { notes }),
  });
}

if (import.meta.main) {
  const { data, ownerClient, ...context } = CHECK_REQUEST.parse(
    JSON.parse(z.string().parse(process.argv[2])),
  );
  const { folder, remote, branch } = configuredHubSource(data);
  const check = await checkConfiguredSource(
    folder,
    { remote, branch },
    ownerClient === undefined ? undefined : { data, client: ownerClient },
    context,
  );
  process.stdout.write(`${JSON.stringify(check)}\n`);
}
