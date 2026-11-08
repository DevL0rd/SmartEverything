import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';

const COMMIT = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const SOURCE = z.strictObject({
  folder: z.string().refine(isAbsolute),
  remote: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
  branch: z.string().min(1),
});

export type HubUpdateSource = z.infer<typeof SOURCE>;

export const HUB_SOURCE_OFFER = z.strictObject({
  source: SOURCE,
  head: COMMIT,
  tip: COMMIT,
  remoteIdentity: z.string().regex(/^[a-f0-9]{64}$/u),
  hasPendingFiles: z.boolean(),
});

export type SourceOffer = z.infer<typeof HUB_SOURCE_OFFER>;

export function remoteIdentityOf(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

interface GitOutput {
  readonly code: number | null;
  readonly text: string;
}

export class HubSourceError extends Error {
  override readonly name = 'HubSourceError';

  constructor(
    readonly code: 'git' | 'branch' | 'changed' | 'pending' | 'diverged' | 'conflict',
    message: string,
  ) {
    super(message);
  }
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const clean = Object.fromEntries(
    Object.entries(env).filter(([name]) => !name.startsWith('GIT_')),
  );
  return {
    ...clean,
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_LAZY_FETCH: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    LC_ALL: 'C',
  };
}

export function gitSource(
  cwd: string,
  args: readonly string[],
  input?: string | Buffer,
  indexFile?: string,
): Promise<GitOutput> {
  return new Promise((done, fail) => {
    const child = spawn(
      'git',
      ['-c', 'protocol.ext.allow=never', '-c', 'core.hooksPath=/dev/null', ...args],
      {
        cwd,
        env: {
          ...gitEnvironment(),
          ...(indexFile === undefined ? {} : { GIT_INDEX_FILE: indexFile }),
        },
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
    child.stdout.setEncoding('utf8');
    let text = '';
    child.stdout.on('data', (chunk: string) => {
      text += chunk;
    });
    child.once('error', fail);
    child.once('close', (code) => {
      done({ code, text });
    });
    child.stdin.on('error', fail);
    child.stdin.end(input);
  });
}

export async function gitSourceText(
  cwd: string,
  args: readonly string[],
  action: string,
): Promise<string> {
  const result = await gitSource(cwd, args);
  if (result.code !== 0)
    throw new HubSourceError('git', `Git could not ${action} (exit ${String(result.code)}).`);
  return result.text;
}

export function commitOf(text: string): string {
  return COMMIT.parse(text.trim());
}

export function branchRef(source: HubUpdateSource): string {
  return `refs/heads/${source.branch}`;
}

export async function readSourceHead(source: HubUpdateSource): Promise<string> {
  return commitOf(
    await gitSourceText(source.folder, ['rev-parse', '--verify', 'HEAD'], 'read HEAD'),
  );
}

export async function readSourceRemote(source: HubUpdateSource): Promise<string> {
  const url = (
    await gitSourceText(source.folder, ['remote', 'get-url', source.remote], 'read the remote')
  ).trim();
  if (url.length === 0 || /[\r\n]/u.test(url))
    throw new HubSourceError('git', 'The configured Git remote has no usable address.');
  return url;
}

export function readSourceStatus(source: HubUpdateSource): Promise<string> {
  return gitSourceText(
    source.folder,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    'read pending files',
  );
}

async function checkedSource(input: HubUpdateSource): Promise<HubUpdateSource> {
  const source = SOURCE.parse(input);
  const root = (
    await gitSourceText(source.folder, ['rev-parse', '--show-toplevel'], 'find the checkout')
  ).trim();
  if (resolve(root) !== resolve(source.folder))
    throw new HubSourceError('git', 'The update source must be the root of a Git checkout.');
  const ref = branchRef(source);
  await gitSourceText(source.folder, ['check-ref-format', ref], 'validate the tracked branch');
  return source;
}

async function readSourceTip(source: HubUpdateSource, remote: string): Promise<string> {
  const ref = branchRef(source);
  const output = await gitSourceText(
    source.folder,
    ['ls-remote', '--exit-code', '--refs', '--', remote, ref],
    'check the tracked branch',
  );
  const [line, extra] = output.trimEnd().split('\n');
  const [tip, actualRef] = (line ?? '').split('\t');
  if (tip === undefined || actualRef !== ref || extra !== undefined)
    throw new HubSourceError('git', 'Git did not return exactly the tracked branch.');
  return commitOf(tip);
}

export async function probeHubUpdateTip(input: HubUpdateSource): Promise<string> {
  const source = await checkedSource(input);
  return readSourceTip(source, await readSourceRemote(source));
}

export async function inspectHubUpdateSource(
  input: HubUpdateSource,
): Promise<{ readonly offer: SourceOffer; readonly status: string }> {
  const source = await checkedSource(input);
  const remote = await readSourceRemote(source);
  const tip = await readSourceTip(source, remote);
  const [head, status] = await Promise.all([readSourceHead(source), readSourceStatus(source)]);
  return {
    offer: {
      source,
      head,
      tip,
      remoteIdentity: remoteIdentityOf(remote),
      hasPendingFiles: status.length > 0,
    },
    status,
  };
}

export async function checkHubUpdateSource(input: HubUpdateSource): Promise<SourceOffer> {
  return (await inspectHubUpdateSource(input)).offer;
}
