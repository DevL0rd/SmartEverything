import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { HubUpdateSourceCheck } from '@smarteverything/domain';
import { readHubSourceNotes } from './hub-update-source-notes.ts';
import {
  branchRef,
  commitOf,
  gitSource,
  gitSourceText,
  HubSourceError,
  readSourceRemote,
  remoteIdentityOf,
  type SourceOffer,
} from './hub-update-source.ts';

type Relation = HubUpdateSourceCheck['relation'];
type AvailableUpdate = NonNullable<HubUpdateSourceCheck['availableUpdate']>;

interface UpdateRange {
  readonly kind: AvailableUpdate;
  readonly from: string;
}

interface SourceRelations {
  readonly checkout: Relation;
  readonly running: Relation | undefined;
  readonly availableUpdate?: AvailableUpdate;
  readonly notes?: string;
}

interface ComparisonContext {
  readonly runningTip?: string | undefined;
  readonly comparisonFolder?: string;
  readonly includeNotes?: boolean;
}

async function ancestor(folder: string, earlier: string, later: string): Promise<boolean> {
  const result = await gitSource(folder, [
    '--no-replace-objects',
    'merge-base',
    '--is-ancestor',
    earlier,
    later,
  ]);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  throw new HubSourceError('git', 'Git could not compare the local and remote commits.');
}

async function compare(folder: string, head: string, tip: string): Promise<Relation> {
  if (await ancestor(folder, head, tip)) return 'remote_ahead';
  return (await ancestor(folder, tip, head)) ? 'local_ahead' : 'diverged';
}

async function compareKnown(folder: string, head: string, tip: string): Promise<Relation> {
  if (head === tip) return 'same';
  const known = await gitSource(folder, [
    '--no-replace-objects',
    'cat-file',
    '-e',
    `${head}^{commit}`,
  ]);
  return known.code === 0 ? compare(folder, head, tip) : 'unknown';
}

function updateRangeOf(
  offer: SourceOffer,
  relations: SourceRelations,
  runningTip: string | undefined,
): UpdateRange | undefined {
  if (runningTip !== undefined)
    return relations.running === 'remote_ahead'
      ? { kind: 'running_behind', from: runningTip }
      : undefined;
  return relations.checkout === 'remote_ahead'
    ? { kind: 'source_ahead', from: offer.head }
    : undefined;
}

async function relationsAt(
  folder: string,
  offer: SourceOffer,
  { runningTip, includeNotes }: ComparisonContext,
): Promise<SourceRelations> {
  const [checkout, running] = await Promise.all([
    compareKnown(folder, offer.head, offer.tip),
    runningTip === undefined ? undefined : compareKnown(folder, runningTip, offer.tip),
  ]);
  const relations = { checkout, running };
  const range = updateRangeOf(offer, relations, runningTip);
  if (range === undefined) return relations;
  const notes =
    includeNotes === true ? await readHubSourceNotes(folder, range.from, offer.tip) : undefined;
  return {
    ...relations,
    availableUpdate: range.kind,
    ...(notes === undefined ? {} : { notes }),
  };
}

async function fetchForComparison(
  offer: SourceOffer,
  folder: string,
  context: ComparisonContext,
): Promise<SourceRelations> {
  const { source, tip } = offer;
  const remote = await readSourceRemote(source);
  if (remoteIdentityOf(remote) !== offer.remoteIdentity)
    throw new HubSourceError('changed', 'The configured Git remote changed. Check again.');
  const url = isAbsolute(remote) || remote.includes(':') ? remote : join(source.folder, remote);
  await gitSourceText(
    folder,
    ['clone', '--shared', '--no-checkout', '--', source.folder, '.'],
    'open an isolated checkout for comparison',
  );
  await gitSourceText(
    folder,
    ['fetch', '--no-tags', '--no-auto-maintenance', '--', url, branchRef(source)],
    'read the tracked branch into the temporary checkout',
  );
  const fetched = await gitSourceText(
    folder,
    ['rev-parse', '--verify', 'FETCH_HEAD'],
    'read the fetched commit',
  );
  if (commitOf(fetched) !== tip)
    throw new HubSourceError('changed', 'The remote branch moved. Check for updates again.');
  return relationsAt(folder, offer, context);
}

export async function sourceRelations(
  offer: SourceOffer,
  context: ComparisonContext = {},
): Promise<SourceRelations> {
  const { runningTip, comparisonFolder } = context;
  const { source, head, tip } = offer;
  const checkout = head === tip ? 'same' : 'unknown';
  const running = runningTip === undefined ? undefined : runningTip === tip ? 'same' : 'unknown';
  if (checkout === 'same' && running !== 'unknown') return { checkout, running };
  const shallow = await gitSourceText(
    source.folder,
    ['rev-parse', '--is-shallow-repository'],
    'check for full commit history',
  );
  if (shallow.trim() === 'true') return { checkout, running };
  const known = await gitSource(source.folder, [
    '--no-replace-objects',
    'cat-file',
    '-e',
    `${tip}^{commit}`,
  ]);
  if (known.code === 0) return relationsAt(source.folder, offer, context);
  if (comparisonFolder !== undefined) return fetchForComparison(offer, comparisonFolder, context);
  const folder = await mkdtemp(join(tmpdir(), 'smarteverything-source-check-'));
  try {
    return await fetchForComparison(offer, folder, context);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
