import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { HookError, parseJson, type AgentInput } from './input.ts';
import { GIT_MS, nonEmptyLines, ROOT, run } from './process.ts';
import type { Snapshot } from './types.ts';

const STATE = join(ROOT, '.cache', 'claude-hooks');
const DEPENDENCY_FILES = ['*package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'patches/**'];
const snapshotFile = z.union([
  z.object({ failed: z.string() }),
  z.object({
    counts: z.record(z.string(), z.number().int()),
    projects: z.array(z.string()).optional(),
  }),
]);
const manifestHashes = z.record(z.string(), z.string());

export function agentName(input: AgentInput): string {
  return input.agent_id ?? 'main';
}

export function agentFile(session: string, agent: string, suffix: string): string {
  return join(STATE, session, `${agent}.${suffix}`);
}

export async function addLines(path: string, lines: readonly string[]): Promise<void> {
  if (lines.length === 0) return;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, lines.map((line) => `${line}\n`).join(''));
}

export async function takeLines(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  const taken = `${path}.${String(process.pid)}.taken`;
  await rename(path, taken);
  const lines = nonEmptyLines(await readFile(taken, 'utf8'));
  await rm(taken);
  return [...new Set(lines)];
}

export async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temp, content);
  await rename(temp, path);
}

async function readParsed<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  if (!existsSync(path)) return null;
  const parsed = parseJson(await readFile(path, 'utf8'));
  const valid = parsed.ok ? schema.safeParse(parsed.value) : null;
  if (valid?.success !== true) {
    const detail = parsed.ok ? 'unexpected shape' : parsed.error;
    throw new HookError('StateError', `${path} is unreadable: ${detail}`);
  }
  return valid.data;
}

export function readSnapshot(session: string, agent: string): Promise<Snapshot | null> {
  return readParsed(agentFile(session, agent, 'snapshot.json'), snapshotFile);
}

export async function hashManifests(): Promise<Record<string, string>> {
  const args = ['ls-files', '-co', '--exclude-standard', '--', ...DEPENDENCY_FILES];
  const listing = await run('git', args, GIT_MS);
  if (listing.code !== 0) {
    throw new HookError('GitCheckError', `git ls-files failed: ${listing.stderr}${listing.detail}`);
  }
  const files = nonEmptyLines(listing.stdout).filter((file) => existsSync(join(ROOT, file)));
  const hashes = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(join(ROOT, file));
      return [file, createHash('sha1').update(content).digest('hex')] as const;
    }),
  );
  return Object.fromEntries(hashes);
}

export function readManifests(path: string): Promise<Record<string, string> | null> {
  return readParsed(path, manifestHashes);
}

export async function removeSession(session: string): Promise<void> {
  await rm(join(STATE, session), { recursive: true, force: true });
  try {
    await rmdir(STATE);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : null;
    if (code === 'ENOTEMPTY' || code === 'ENOENT') return;
    throw error;
  }
}
