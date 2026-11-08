import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { pendingFiles } from './hub-update-candidate.ts';
import { commitOf, gitSource, HubSourceError } from './hub-update-source.ts';

type Snapshot = Awaited<ReturnType<typeof pendingFiles>>;

async function git(
  folder: string,
  args: readonly string[],
  action: string,
  options: { readonly input?: string | Buffer; readonly index?: string } = {},
): Promise<string> {
  const result = await gitSource(folder, args, options.input, options.index);
  if (result.code !== 0) throw new HubSourceError('git', `Git could not ${action}.`);
  return result.text;
}

async function trackedTree(
  folder: string,
  index: string,
  base: string,
  patch: string,
): Promise<string> {
  await git(folder, ['read-tree', base], 'read the reviewed base', { index });
  if (patch.length > 0)
    await git(folder, ['apply', '--cached', '--binary', '-'], 'save the reviewed tracked changes', {
      input: patch,
      index,
    });
  return commitOf(await git(folder, ['write-tree'], 'write the tracked tree', { index }));
}

interface BlobInput {
  readonly path: string;
  readonly mode: string;
  readonly file: string;
}

function untrackedBlobs(folder: string, snapshot: Snapshot): readonly BlobInput[] {
  mkdirSync(folder, { mode: 0o700 });
  const entries: BlobInput[] = [];
  for (const [path, content] of snapshot.untracked) {
    const executable = content.kind === 'file' && (content.mode & 0o100) !== 0;
    const fileMode = executable ? '100755' : '100644';
    const mode = content.kind === 'link' ? '120000' : fileMode;
    const bytes = content.kind === 'link' ? content.target : content.bytes;
    const file = `blob-${String(entries.length)}`;
    writeFileSync(join(folder, file), bytes, { flag: 'wx', mode: 0o600 });
    entries.push({ path, mode, file });
  }
  return entries;
}

async function hashBlobs(
  folder: string,
  scratch: string,
  entries: readonly BlobInput[],
): Promise<readonly string[]> {
  const gitDirectory = (
    await git(folder, ['rev-parse', '--absolute-git-dir'], 'find the recovery repository')
  ).trimEnd();
  if (!isAbsolute(gitDirectory))
    throw new HubSourceError('git', 'Git did not return an absolute recovery repository path.');
  const output = await git(
    scratch,
    [
      '--git-dir',
      gitDirectory,
      '--work-tree',
      scratch,
      'hash-object',
      '-w',
      '--no-filters',
      '--stdin-paths',
    ],
    'save the untracked files',
    { input: `${entries.map(({ file }) => file).join('\n')}\n` },
  );
  const ids = output.trim().split('\n').map(commitOf);
  if (ids.length !== entries.length)
    throw new HubSourceError('git', 'Git did not return an object for each saved file.');
  return ids;
}

async function untrackedTree(folder: string, index: string, snapshot: Snapshot): Promise<string> {
  const scratch = join(dirname(index), 'blobs');
  const blobs = untrackedBlobs(scratch, snapshot);
  const ids = await hashBlobs(folder, scratch, blobs);
  const entries = blobs.map(({ mode, path }, position) => {
    const id = ids[position];
    if (id === undefined)
      throw new HubSourceError('git', 'Git did not return a saved file object.');
    return `${mode} ${id}\t${path}\0`;
  });
  await git(folder, ['update-index', '-z', '--index-info'], 'prepare the untracked tree', {
    input: entries.join(''),
    index,
  });
  return commitOf(await git(folder, ['write-tree'], 'write the untracked tree', { index }));
}

async function commit(
  folder: string,
  tree: string,
  parents: readonly string[],
  message: string,
): Promise<string> {
  return commitOf(
    await git(
      folder,
      ['commit-tree', tree, ...parents.flatMap((parent) => ['-p', parent]), '-m', message],
      'create the local recovery snapshot; check the repository Git identity',
    ),
  );
}

export async function savePendingTrees(
  folder: string,
  scratch: string,
  base: string,
  snapshot: Snapshot,
): Promise<string> {
  const staged = await trackedTree(folder, join(scratch, 'staged'), base, snapshot.staged);
  const tracked = await trackedTree(folder, join(scratch, 'working'), base, snapshot.patch);
  const index = await commit(folder, staged, [base], 'SmartEverything recovery index');
  const parents = [base, index];
  if (snapshot.untracked.size > 0) {
    const untracked = await untrackedTree(folder, join(scratch, 'untracked'), snapshot);
    parents.push(await commit(folder, untracked, [], 'SmartEverything recovery untracked files'));
  }
  return commit(folder, tracked, parents, 'SmartEverything pending work recovery');
}
