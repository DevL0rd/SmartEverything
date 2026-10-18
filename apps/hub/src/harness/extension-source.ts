import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ApiError, type HarnessExtensionSourceRequest } from '@smarteverything/domain';

const run = promisify(execFile);
const GITHUB_SHORTHAND = /^[\w.-]+\/[\w.-]+$/u;
export interface GitSource {
  readonly url: string;
  readonly ref: string | null;
  readonly path: string | null;
}

export interface CheckedOutSource {
  readonly directory: string;
  readonly commit: string;
}

export function gitSourceOf(request: HarnessExtensionSourceRequest): GitSource {
  const base = locate(request.url.trim());
  return {
    url: base.url,
    ref: request.ref ?? base.ref,
    path: request.path ?? base.path,
  };
}

function locate(text: string): GitSource {
  const plain: GitSource = { url: text, ref: null, path: null };
  if (GITHUB_SHORTHAND.test(text) && !text.startsWith('.'))
    return { ...plain, url: `https://github.com/${text}` };
  return (URL.canParse(text) ? hosted(new URL(text)) : undefined) ?? plain;
}

function hosted(url: URL): GitSource | undefined {
  const parts = url.pathname.split('/').filter((part) => part !== '');
  const [owner, repository] = parts;
  if (owner === undefined || repository === undefined) return undefined;
  const repo = `https://github.com/${owner}/${repository.replace(/\.git$/u, '')}`;
  if (url.hostname === 'github.com') return githubLocation(repo, parts.slice(2));
  if (url.hostname === 'raw.githubusercontent.com')
    return { url: repo, ref: parts[2] ?? null, path: directoryOf(parts.slice(3)) };
  return undefined;
}

function githubLocation(repo: string, parts: readonly string[]): GitSource {
  const [kind, ref, ...rest] = parts;
  if (kind !== 'tree' && kind !== 'blob') return { url: repo, ref: null, path: null };
  return { url: repo, ref: ref ?? null, path: directoryOf(rest) };
}

function directoryOf(parts: readonly string[]): string | null {
  const last = parts.at(-1);
  const folder = last === 'SKILL.md' || last === 'plugin.json' ? parts.slice(0, -1) : parts;
  const root = folder.at(-1) === '.claude-plugin' ? folder.slice(0, -1) : folder;
  return root.length === 0 ? null : root.join('/');
}

async function checkOut(source: GitSource, directory: string): Promise<CheckedOutSource> {
  await mkdir(directory, { recursive: true });
  await git(directory, ['init', '--quiet']);
  await git(directory, [
    'fetch',
    '--quiet',
    '--depth',
    '1',
    '--',
    source.url,
    source.ref ?? 'HEAD',
  ]);
  await git(directory, ['checkout', '--quiet', '--force', 'FETCH_HEAD']);
  return { directory, commit: (await git(directory, ['rev-parse', 'HEAD'])).trim() };
}

export async function withCheckout<T>(
  source: GitSource,
  use: (checkout: CheckedOutSource) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'smarteverything-source-'));
  try {
    return await use(await checkOut(source, directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function git(directory: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await run('git', ['-C', directory, ...args]);
    return stdout;
  } catch (cause) {
    throw new ApiError('upstream_failed', `git ${args[0] ?? ''} failed: ${firstLine(cause)}`);
  }
}

function firstLine(cause: unknown): string {
  const text = cause instanceof Error && 'stderr' in cause ? String(cause.stderr) : String(cause);
  return text.trim().split('\n')[0] ?? 'unknown error';
}
