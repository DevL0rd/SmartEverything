import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isMissing } from '../errors.ts';
import { TMP } from '../paths.ts';
import { run } from '../processes.ts';
import { CACHE } from './workloads-shared.ts';

export const GIT_URL = 'https://github.com/git/git';
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/u;

export interface Archives {
  readonly tag: string;
  readonly tarball: string;
  readonly zipfile: string;
  readonly tarReference: string;
  readonly zipReference: string;
}

export function latestReleaseTag(tags: readonly string[]): string {
  const releases = tags.filter((tag) => RELEASE_TAG.test(tag));
  const latest = releases
    .map((tag) => ({ tag, parts: tag.slice(1).split('.').map(Number) }))
    .sort((left, right) => {
      for (let index = 0; index < 3; index += 1) {
        const difference = (right.parts[index] ?? 0) - (left.parts[index] ?? 0);
        if (difference !== 0) return difference;
      }
      return 0;
    })[0];
  if (latest === undefined) throw new Error('The git mirror has no release tag.');
  return latest.tag;
}

async function present(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (cause) {
    if (isMissing(cause)) return false;
    throw cause;
  }
}

const environment = { TMPDIR: TMP, GIT_TERMINAL_PROMPT: '0' };

export function mirrorPath(): string {
  return join(CACHE, 'git.git');
}

export async function ensureMirror(): Promise<string> {
  const mirror = mirrorPath();
  if (await present(join(mirror, 'HEAD'))) return mirror;
  await mkdir(CACHE, { recursive: true, mode: 0o700 });
  await rm(mirror, { recursive: true, force: true });
  await run('git', ['clone', '--mirror', GIT_URL, mirror], { env: environment });
  return mirror;
}

export async function ensureArchives(): Promise<Archives> {
  const mirror = await ensureMirror();
  const tags = (
    await run('git', ['-C', mirror, 'tag', '--list', 'v*'], { env: environment })
  ).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const tag = latestReleaseTag(tags);
  const root = join(CACHE, `release-${tag}`);
  const archives = {
    tag,
    tarball: join(root, `git-${tag}.tar.gz`),
    zipfile: join(root, `git-${tag}.zip`),
    tarReference: join(root, 'tar'),
    zipReference: join(root, 'zip'),
  };
  if (await present(join(root, 'complete'))) return archives;
  await rm(root, { recursive: true, force: true });
  await mkdir(archives.tarReference, { recursive: true });
  await mkdir(archives.zipReference, { recursive: true });
  const prefix = `--prefix=git-${tag}/`;
  await run(
    'git',
    ['-C', mirror, 'archive', '--format=tar.gz', prefix, '-o', archives.tarball, tag],
    {
      env: environment,
    },
  );
  await run('git', ['-C', mirror, 'archive', '--format=zip', prefix, '-o', archives.zipfile, tag], {
    env: environment,
  });
  await run('tar', ['xzf', archives.tarball, '--same-permissions', '-C', archives.tarReference]);
  await run('unzip', ['-q', archives.zipfile, '-d', archives.zipReference]);
  await run('touch', [join(root, 'complete')]);
  return archives;
}
