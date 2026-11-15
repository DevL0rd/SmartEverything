import { spawnSync } from 'node:child_process';
import { HUB_UPDATE_COMMIT } from '@smarteverything/domain';

export class ReleaseTreeError extends Error {
  override readonly name = 'ReleaseTreeError';
}

export type Git = (args: readonly string[]) => { readonly status: number; readonly text: string };

export function gitIn(folder: string): Git {
  return (args) => {
    const result = spawnSync('git', [...args], { cwd: folder, encoding: 'utf8' });
    if (result.error !== undefined)
      throw new ReleaseTreeError(`git could not run: ${result.error.message}`);
    return { status: result.status ?? 1, text: result.stdout.trim() };
  };
}

function required(git: Git, args: readonly string[], problem: string): string {
  const result = git(args);
  if (result.status !== 0) throw new ReleaseTreeError(problem);
  return result.text;
}

export function pushedCleanCommit(git: Git): string {
  if (required(git, ['status', '--porcelain'], 'git could not read the working tree') !== '')
    throw new ReleaseTreeError(
      'The working tree is not clean. Commit or remove every change; a release is built from a pushed commit only.',
    );
  required(git, ['fetch', '--quiet', 'origin', 'main'], 'git could not fetch origin/main');
  const head = HUB_UPDATE_COMMIT.parse(required(git, ['rev-parse', 'HEAD'], 'git has no HEAD'));
  const contained = git(['merge-base', '--is-ancestor', head, 'origin/main']);
  if (contained.status !== 0)
    throw new ReleaseTreeError(
      `HEAD ${head} is not pushed to origin/main. Push it, then build the release again.`,
    );
  return head;
}
