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

async function fastForwarded(source: HubUpdateSource, tip: string): Promise<void> {
  const head = await readSourceHead(source);
  if (head === tip) return;
  if (await isAncestor(source.folder, head, tip)) {
    await gitSourceText(
      source.folder,
      ['merge', '--ff-only', '--no-edit', tip],
      'fast-forward the checkout',
    );
    return;
  }
  throw new SyncedCheckoutError(
    (await isAncestor(source.folder, tip, head))
      ? 'The update checkout has commits that are not on the remote branch: push first.'
      : 'The update checkout and the remote branch have diverged: reconcile them and push first.',
  );
}

export async function syncedCheckout(
  layout: HubLayout,
  root: string,
  ports: CheckoutPorts = REGISTERED_PORTS,
): Promise<string> {
  const source = configuredSource(layout, root);
  await requireCleanBranch(source);
  const tip = await fetchedTip(source);
  await fastForwarded(source, tip);
  ports.install(root);
  return tip;
}
