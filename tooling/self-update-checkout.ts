import { resolve } from 'node:path';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { findUpdateSource } from '../apps/hub/src/self-update/update-source.ts';
import { pnpmProgram } from './build-host.ts';
import {
  branchRef,
  commitOf,
  gitSource,
  gitSourceText,
  readSourceHead,
  readSourceStatus,
  type HubUpdateSource,
} from './hub-update-source.ts';
import { runCommand } from './publish-app-update-shared.ts';

export class SyncedCheckoutError extends Error {
  override readonly name = 'SyncedCheckoutError';
}

export interface CheckoutPorts {
  readonly install: (root: string) => void;
}

const REGISTERED_PORTS: CheckoutPorts = {
  install: (root) => {
    runCommand({
      title: 'install the locked dependencies',
      program: pnpmProgram(),
      args: ['install', '--frozen-lockfile', '--prefer-offline'],
      cwd: root,
      environment: {},
    });
  },
};

function configuredSource(layout: HubLayout, root: string): HubUpdateSource {
  const configured = findUpdateSource(layout);
  if (configured === undefined)
    throw new SyncedCheckoutError(
      'This hub has no update source configured: run tooling/configure-update-source.ts.',
    );
  if (resolve(configured.checkout) !== resolve(root))
    throw new SyncedCheckoutError(
      `The update runs in ${root} but the configured update checkout is ${configured.checkout}.`,
    );
  return { folder: configured.checkout, remote: configured.remote, branch: configured.branch };
}

async function isAncestor(folder: string, earlier: string, later: string): Promise<boolean> {
  const result = await gitSource(folder, [
    '--no-replace-objects',
    'merge-base',
    '--is-ancestor',
    earlier,
    later,
  ]);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  throw new SyncedCheckoutError('Git could not compare the checkout with the remote branch.');
}

async function requireCleanBranch(source: HubUpdateSource): Promise<void> {
  const branch = (
    await gitSourceText(source.folder, ['rev-parse', '--abbrev-ref', 'HEAD'], 'read the branch')
  ).trim();
  if (branch !== source.branch)
    throw new SyncedCheckoutError(
      `The update checkout is on ${branch} but the update source tracks ${source.branch}: switch it back.`,
    );
  if ((await readSourceStatus(source)).length > 0)
    throw new SyncedCheckoutError(
      'The update checkout has uncommitted changes: commit and push first.',
    );
}

async function fetchedTip(source: HubUpdateSource): Promise<string> {
  await gitSourceText(
    source.folder,
    ['fetch', '--no-tags', '--', source.remote, branchRef(source)],
    'fetch the tracked branch',
  );
  return commitOf(
    await gitSourceText(source.folder, ['rev-parse', '--verify', 'FETCH_HEAD'], 'read the tip'),
  );
}

async function requireOnBranch(
  source: HubUpdateSource,
  revision: string,
  tip: string,
): Promise<void> {
  const known = await gitSource(source.folder, [
    '--no-replace-objects',
    'cat-file',
    '-e',
    `${revision}^{commit}`,
  ]);
  if (known.code !== 0 || !(await isAncestor(source.folder, revision, tip)))
    throw new SyncedCheckoutError(
      `The planned revision ${revision} is no longer on the remote ${source.branch} branch.`,
    );
}

async function fastForwarded(
  source: HubUpdateSource,
  target: string,
  planned: boolean,
): Promise<void> {
  const head = await readSourceHead(source);
  if (head === target) return;
  if (await isAncestor(source.folder, head, target)) {
    await gitSourceText(
      source.folder,
      ['merge', '--ff-only', '--no-edit', target],
      'fast-forward the checkout',
    );
    return;
  }
  if (await isAncestor(source.folder, target, head))
    throw new SyncedCheckoutError(
      planned
        ? `The update checkout is already past the planned revision ${target}.`
        : 'The update checkout has commits that are not on the remote branch: push first.',
    );
  throw new SyncedCheckoutError(
    'The update checkout and the remote branch have diverged: reconcile them and push first.',
  );
}

export interface CheckoutOptions {
  readonly revision?: string | undefined;
  readonly ports?: CheckoutPorts;
}

export async function syncedCheckout(
  layout: HubLayout,
  root: string,
  options: CheckoutOptions = {},
): Promise<string> {
  const { revision, ports = REGISTERED_PORTS } = options;
  const source = configuredSource(layout, root);
  await requireCleanBranch(source);
  const tip = await fetchedTip(source);
  const target = revision ?? tip;
  if (revision !== undefined) await requireOnBranch(source, revision, tip);
  await fastForwarded(source, target, revision !== undefined);
  ports.install(root);
  return target;
}
