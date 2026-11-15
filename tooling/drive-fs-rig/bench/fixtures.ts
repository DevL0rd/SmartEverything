import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { TMP } from '../paths.ts';
import { isMissing } from '../errors.ts';
import { run } from '../processes.ts';
import { latestReleaseTag } from '../suites/workloads-fixtures.ts';
import { bench } from './paths.ts';

const GIT_URL = 'https://github.com/git/git';
const environment = { TMPDIR: TMP, GIT_TERMINAL_PROMPT: '0' };

export interface Fixtures {
  readonly mirror: string;
  readonly tarball: string;
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

export async function ensureFixtures(): Promise<Fixtures> {
  await mkdir(bench.cache, { recursive: true, mode: 0o700 });
  if (!(await present(join(bench.mirror, 'HEAD'))))
    await run('git', ['clone', '--quiet', '--mirror', GIT_URL, bench.mirror], {
      env: environment,
    });
  const tags = (
    await run('git', ['-C', bench.mirror, 'tag', '--list', 'v*'], { env: environment })
  ).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const tag = latestReleaseTag(tags);
  const tarball = join(bench.cache, `git-${tag}.tar.gz`);
  if (!(await present(tarball)))
    await run(
      'git',
      [
        '-C',
        bench.mirror,
        'archive',
        '--format=tar.gz',
        `--prefix=git-${tag}/`,
        '-o',
        tarball,
        tag,
      ],
      { env: environment },
    );
  return { mirror: bench.mirror, tarball };
}
