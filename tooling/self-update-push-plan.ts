import { type PlanRequest, type PlanResult } from '../apps/hub/src/self-update/plan-contract.ts';
import { planRelease } from '../apps/hub/src/self-update/release-planner.ts';
import {
  branchRef,
  commitOf,
  gitSource,
  gitSourceText,
  readSourceHead,
  readSourceStatus,
  type HubUpdateSource,
} from './hub-update-source.ts';
import { readHubSourceNotes } from './hub-update-source-notes.ts';

const short = (commit: string): string => commit.slice(0, 12);

async function checkoutProblem(source: HubUpdateSource, tip: string): Promise<string | undefined> {
  const branch = await gitSource(source.folder, ['symbolic-ref', 'HEAD']);
  if (branch.code !== 0 || branch.text.trim() !== branchRef(source))
    return `The update checkout is not on ${source.branch}. Switch it back; nothing was reset.`;
  if ((await readSourceStatus(source)).length > 0)
    return 'The update checkout has uncommitted work. Commit or save it; nothing was reset.';
  const head = await readSourceHead(source);
  const ancestor = await gitSource(source.folder, ['merge-base', '--is-ancestor', head, tip]);
  if (ancestor.code === 0) return undefined;
  return ancestor.code === 1
    ? 'The update checkout has commits that are not on the remote branch or has diverged from it. Reconcile it; nothing was reset.'
    : 'Git could not compare the update checkout with the pushed revision.';
}

async function changedPaths(
  source: HubUpdateSource,
  base: string,
  tip: string,
): Promise<readonly string[] | undefined> {
  const diff = await gitSource(source.folder, [
    '--no-replace-objects',
    'diff',
    '--name-only',
    '-z',
    base,
    tip,
  ]);
  return diff.code === 0 ? diff.text.split('\0').filter((path) => path.length > 0) : undefined;
}

async function authoredNotes(
  source: HubUpdateSource,
  request: PlanRequest,
  candidates: readonly string[],
): Promise<string | undefined> {
  for (const from of candidates) {
    const notes = await readHubSourceNotes(source.folder, from, request.tip);
    if (notes !== undefined) return notes;
  }
  return undefined;
}

export async function planPush(source: HubUpdateSource, request: PlanRequest): Promise<PlanResult> {
  await gitSourceText(
    source.folder,
    ['fetch', '--no-tags', '--', source.remote, branchRef(source)],
    'fetch the tracked branch',
  );
  const fetched = commitOf(
    await gitSourceText(source.folder, ['rev-parse', '--verify', 'FETCH_HEAD'], 'read the tip'),
  );
  if (fetched !== request.tip)
    return {
      status: 'superseded',
      message: `The branch moved to ${short(fetched)} after this push; the newer push releases it.`,
    };
  const problem = await checkoutProblem(source, request.tip);
  if (problem !== undefined) return { status: 'refused', message: problem };
  const head = await readSourceHead(source);
  const base = request.base ?? head;
  const paths = await changedPaths(source, base, request.tip);
  if (paths === undefined)
    return {
      status: 'refused',
      message: `The revision ${short(base)} that this release compares against is not in the checkout.`,
    };
  const { components } = planRelease(paths);
  if (components.length === 0) return { status: 'planned', base, components, notes: null };
  const candidates = [...new Set([base, head, request.pushedFrom ?? head])];
  const notes = await authoredNotes(source, request, candidates);
  return notes === undefined
    ? {
        status: 'refused',
        message: `release-notes/hub.json is missing at ${short(request.tip)}, was not changed by that commit, or its from field is not ${short(base)}.`,
      }
    : { status: 'planned', base, components, notes };
}
