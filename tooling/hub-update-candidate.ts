import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  branchRef,
  commitOf,
  gitSource,
  gitSourceText,
  HUB_SOURCE_OFFER,
  HubSourceError,
  readSourceHead,
  readSourceRemote,
  readSourceStatus,
  remoteIdentityOf,
  type SourceOffer,
} from './hub-update-source.ts';
import { assertCandidateDestination } from './self-update-candidate-identity.ts';

type UntrackedContent =
  | { readonly kind: 'link'; readonly target: string }
  | { readonly kind: 'file'; readonly mode: number; readonly bytes: Buffer };

interface PendingFiles {
  readonly staged: string;
  readonly patch: string;
  readonly untracked: ReadonlyMap<string, UntrackedContent>;
  readonly identity: string;
}

export async function pendingFiles(folder: string): Promise<PendingFiles> {
  const diff = ['--binary', '--full-index', '--no-ext-diff', '--no-textconv'];
  const [patch, staged, paths] = await Promise.all([
    gitSourceText(folder, ['diff', ...diff, 'HEAD', '--'], 'snapshot tracked changes'),
    gitSourceText(folder, ['diff', ...diff, '--cached', 'HEAD', '--'], 'snapshot staged changes'),
    gitSourceText(
      folder,
      ['ls-files', '--others', '--exclude-standard', '-z'],
      'list untracked files',
    ),
  ]);
  const hash = createHash('sha256').update(JSON.stringify([staged, patch]));
  const untracked = new Map<string, UntrackedContent>();
  for (const path of paths.split('\0').filter(Boolean).sort()) {
    const content = readUntracked(folder, path);
    untracked.set(path, content);
    if (content.kind === 'link') hash.update(JSON.stringify([path, 'link', content.target]));
    else {
      hash.update(JSON.stringify([path, 'file', content.mode, content.bytes.length]));
      hash.update(content.bytes);
    }
  }
  return { staged, patch, untracked, identity: hash.digest('hex') };
}

export async function hubPendingIdentity(folder: string): Promise<string> {
  return (await pendingFiles(folder)).identity;
}

function pathParts(path: string): readonly string[] {
  const parts = path.split('/');
  if (
    isAbsolute(path) ||
    path.includes('\uFFFD') ||
    parts.some((part) => ['', '.', '..', '.git'].includes(part.toLowerCase()))
  )
    throw new HubSourceError('conflict', 'An untracked path cannot be copied safely.');
  return parts;
}

function safeParent(root: string, parts: readonly string[], create: boolean): string {
  let path = root;
  for (const part of parts) {
    path = join(path, part);
    if (create) mkdirSync(path, { recursive: true });
    if (!lstatSync(path).isDirectory())
      throw new HubSourceError('conflict', 'An untracked file collides with a non-directory path.');
  }
  return path;
}

function pendingPath(root: string, path: string, create: boolean): string {
  const parts = pathParts(path);
  const leaf = parts.at(-1);
  if (leaf === undefined) throw new HubSourceError('conflict', 'An untracked path is empty.');
  return join(safeParent(root, parts.slice(0, -1), create), leaf);
}

function readUntracked(source: string, path: string): UntrackedContent {
  const from = pendingPath(source, path, false);
  const stat = lstatSync(from);
  if (stat.isSymbolicLink()) return { kind: 'link', target: readlinkSync(from) };
  if (!stat.isFile())
    throw new HubSourceError('conflict', 'An untracked entry is not a file or symbolic link.');
  return { kind: 'file', mode: stat.mode & 0o777, bytes: readFileSync(from) };
}

function carryUntracked(candidate: string, path: string, content: UntrackedContent): void {
  const to = pendingPath(candidate, path, true);
  if (content.kind === 'link') symlinkSync(content.target, to);
  else {
    writeFileSync(to, content.bytes, { flag: 'wx', mode: content.mode });
    chmodSync(to, content.mode);
  }
}

async function installPending(snapshot: PendingFiles, candidate: string): Promise<void> {
  if (snapshot.patch.length > 0) {
    const applied = await gitSource(
      candidate,
      ['apply', '--3way', '--binary', '-'],
      snapshot.patch,
    );
    if (applied.code !== 0)
      throw new HubSourceError(
        'conflict',
        'Pending tracked changes conflict with the remote update.',
      );
  }
  for (const [path, content] of snapshot.untracked) {
    try {
      carryUntracked(candidate, path, content);
    } catch (cause) {
      if (cause instanceof HubSourceError) throw cause;
      throw new HubSourceError(
        'conflict',
        `Could not carry the untracked file ${JSON.stringify(path)}.`,
      );
    }
  }
  if (snapshot.untracked.size === 0) return;
  const indexed = await gitSource(
    candidate,
    [
      '--literal-pathspecs',
      'add',
      '--intent-to-add',
      '--force',
      '--pathspec-from-file=-',
      '--pathspec-file-nul',
    ],
    `${[...snapshot.untracked.keys()].join('\0')}\0`,
  );
  if (indexed.code !== 0)
    throw new HubSourceError('git', 'Git could not record the approved untracked paths.');
}

function verifyPending(actual: string, expected: string): void {
  if (actual !== expected)
    throw new HubSourceError('changed', 'Pending files changed. Check for updates again.');
}

async function verifySource(offer: SourceOffer, permitPending: boolean): Promise<void> {
  const { source, head } = offer;
  if ((await readSourceHead(source)) !== head)
    throw new HubSourceError('changed', 'The source checkout changed. Check for updates again.');
  const branch = await gitSource(source.folder, ['symbolic-ref', 'HEAD']);
  if (branch.code !== 0 || branch.text.trim() !== branchRef(source))
    throw new HubSourceError('branch', 'Open the tracked branch before preparing a remote update.');
  if (!permitPending && (await readSourceStatus(source)).length > 0)
    throw new HubSourceError('pending', 'Choose to preserve pending changes before continuing.');
}

async function checkOutTip(offer: SourceOffer, candidate: string): Promise<void> {
  const { source, head, tip } = offer;
  const remote = await readSourceRemote(source);
  if (remoteIdentityOf(remote) !== offer.remoteIdentity)
    throw new HubSourceError('changed', 'The configured Git remote changed. Check again.');
  const url = isAbsolute(remote) || remote.includes(':') ? remote : join(source.folder, remote);
  await gitSourceText(
    candidate,
    ['fetch', '--no-tags', '--', url, branchRef(source)],
    'fetch the tracked branch into the isolated checkout',
  );
  const fetched = commitOf(
    await gitSourceText(
      candidate,
      ['rev-parse', '--verify', 'FETCH_HEAD'],
      'read the fetched commit',
    ),
  );
  if (fetched !== tip)
    throw new HubSourceError('changed', 'The remote branch moved. Check for updates again.');
  const ancestry = await gitSource(candidate, ['merge-base', '--is-ancestor', head, tip]);
  if (ancestry.code === 1)
    throw new HubSourceError(
      'diverged',
      'Local commits and the remote branch diverged. Resolve them before updating.',
    );
  if (ancestry.code !== 0)
    throw new HubSourceError('git', 'Git could not verify the ancestry of the fetched update.');
  await gitSourceText(candidate, ['checkout', '--detach', tip], 'prepare the checked commit');
}

type PendingReview =
  string | { readonly identity: string; readonly checkSaved: () => Promise<void> };

async function reviewPending(
  offer: SourceOffer,
  includePending: boolean,
  reviewedPending: PendingReview | undefined,
): Promise<{ readonly pending: PendingFiles | null; readonly verify: () => Promise<void> }> {
  const saved = typeof reviewedPending === 'object' ? reviewedPending : undefined;
  const expected = typeof reviewedPending === 'string' ? reviewedPending : saved?.identity;
  const permitPending = includePending || saved !== undefined;
  await saved?.checkSaved();
  await verifySource(offer, permitPending);
  const pending =
    includePending || expected !== undefined ? await pendingFiles(offer.source.folder) : null;
  if (pending !== null && expected !== undefined) verifyPending(pending.identity, expected);
  return {
    pending,
    verify: async (): Promise<void> => {
      if (pending !== null) {
        verifyPending(await hubPendingIdentity(offer.source.folder), pending.identity);
      }
      await verifySource(offer, permitPending);
      await saved?.checkSaved();
    },
  };
}

export async function prepareHubUpdateCandidate(
  input: SourceOffer,
  workspace: string,
  includePending: boolean,
  reviewedPending?: PendingReview,
): Promise<string> {
  const offer = HUB_SOURCE_OFFER.parse(input);
  assertCandidateDestination([offer.source.folder], workspace, false);
  const { pending, verify } = await reviewPending(offer, includePending, reviewedPending);
  const candidate = mkdtempSync(join(workspace, 'hub-candidate-'));
  try {
    await gitSourceText(
      workspace,
      ['clone', '--local', '--no-hardlinks', '--no-checkout', '--', offer.source.folder, candidate],
      'create an isolated checkout',
    );
    await checkOutTip(offer, candidate);
    if (pending !== null && includePending) await installPending(pending, candidate);
    await verify();
    return candidate;
  } catch (cause) {
    rmSync(candidate, { recursive: true, force: true });
    throw cause;
  }
}
