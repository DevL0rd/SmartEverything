import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  ApiError,
  HARNESS_GIT_ORIGIN,
  type HarnessExtensionCandidate,
  type HarnessExtensionSourceRequest,
  type HarnessGitOrigin,
} from '@smarteverything/domain';

const run = promisify(execFile);
const GITHUB_SHORTHAND = /^[\w.-]+\/[\w.-]+$/u;
export type GitSource = Readonly<HarnessGitOrigin>;

export interface CheckedOutSource {
  readonly directory: string;
  readonly commit: string;
  readonly files: readonly string[];
}

export function gitSourceOf(request: HarnessExtensionSourceRequest): GitSource {
  const base = locate(request.url.trim());
  return {
    url: base.url,
    ref: request.ref ?? base.ref,
    path: request.path ?? base.path,
  };
}

export function gitFolder(source: GitSource, path: string): GitSource {
  return { ...source, path: path === '' ? null : path };
}

export function offerOrigin(source: GitSource, candidate: HarnessExtensionCandidate): GitSource {
  return HARNESS_GIT_ORIGIN.parse(
    candidate.source === undefined
      ? gitFolder(source, candidate.path)
      : gitSourceOf(candidate.source),
  );
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

async function checkOut(
  source: GitSource,
  directory: string,
  commit: string | null,
): Promise<CheckedOutSource> {
  await mkdir(directory, { recursive: true });
  await git(directory, ['init', '--quiet']);
  await git(directory, [
    'fetch',
    '--quiet',
    '--depth',
    '1',
    '--',
    source.url,
    commit ?? source.ref ?? 'HEAD',
  ]);
  await git(directory, ['checkout', '--quiet', '--force', 'FETCH_HEAD']);
  const files = (await git(directory, ['ls-files', '-z']))
    .split('\0')
    .filter((file) => file !== '');
  return { directory, commit: (await git(directory, ['rev-parse', 'HEAD'])).trim(), files };
}

export async function withCheckout<T>(
  tmp: string,
  source: GitSource,
  use: (checkout: CheckedOutSource) => Promise<T>,
  commit: string | null = null,
): Promise<T> {
  await mkdir(tmp, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(tmp, 'smarteverything-source-'));
  try {
    return await use(await checkOut(source, directory, commit));
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
