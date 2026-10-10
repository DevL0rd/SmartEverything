import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { HookError, parseJson, type AgentInput } from './input.ts';
import { GIT_MS, nonEmptyLines, ROOT, run } from './process.ts';
import type { Originals } from './symbols.ts';
import type { Peer, Snapshot } from './types.ts';

const STATE = join(ROOT, '.cache', 'claude-hooks');
const DEPENDENCY_FILES = ['*package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'patches/**'];
const blockCount = z.coerce.number().int().nonnegative();
const snapshotFile = z.union([
  z.object({ failed: z.string() }),
  z.object({ counts: z.record(z.string(), z.number().int()) }),
]);
const handoverLine = z.object({ agent: z.string(), type: z.string().optional(), file: z.string() });
const manifestHashes = z.record(z.string(), z.string());
const originalsFile = z.record(z.string(), z.string().nullable());

export type Handover = z.infer<typeof handoverLine>;

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

function parseState<T>(path: string, source: string, schema: z.ZodType<T>): T {
  const parsed = parseJson(source);
  const valid = parsed.ok ? schema.safeParse(parsed.value) : null;
  if (valid?.success !== true) {
    const detail = parsed.ok ? 'unexpected shape' : parsed.error;
    throw new HookError('StateError', `${path} is unreadable: ${detail}`);
  }
  return valid.data;
}

async function readParsed<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  if (!existsSync(path)) return null;
  return parseState(path, await readFile(path, 'utf8'), schema);
}

export async function readBlocks(path: string): Promise<number> {
  if (!existsSync(path)) return 0;
  const parsed = blockCount.safeParse((await readFile(path, 'utf8')).trim());
  if (!parsed.success) throw new HookError('StateError', `${path} is not a block count`);
  return parsed.data;
}

export function readSnapshot(session: string, agent: string): Promise<Snapshot | null> {
  return readParsed(agentFile(session, agent, 'snapshot.json'), snapshotFile);
}

export interface Window extends Peer {
  readonly agent: string;
}

export async function readOriginals(session: string, agent: string): Promise<Originals> {
  return (await readParsed(agentFile(session, agent, 'originals.json'), originalsFile)) ?? {};
}

export async function saveOriginal(session: string, agent: string, rel: string): Promise<void> {
  const originals = await readOriginals(session, agent);
  if (Object.hasOwn(originals, rel)) return;
  const path = join(ROOT, rel);
  const content = existsSync(path) ? await readFile(path, 'utf8') : null;
  const next = { ...originals, [rel]: content };
  await writeAtomic(agentFile(session, agent, 'originals.json'), JSON.stringify(next));
}

export async function openWindows(session: string, agent: string): Promise<Window[]> {
  const dir = join(STATE, session);
  if (!existsSync(dir)) return [];
  const agents = (await readdir(dir))
    .filter((name) => name.endsWith('.window'))
    .map((name) => name.slice(0, -'.window'.length))
    .filter((name) => name !== agent);
  return Promise.all(
    agents.map(async (other) => ({
      agent: other,
      files: nonEmptyLines(await readFile(agentFile(session, other, 'window'), 'utf8')),
      originals: await readOriginals(session, other),
      snapshot: await readSnapshot(session, other),
    })),
  );
}

export async function closeWindow(session: string, agent: string): Promise<void> {
  for (const suffix of ['snapshot.json', 'originals.json', 'window']) {
    await rm(agentFile(session, agent, suffix), { force: true });
  }
}

export async function addHandover(session: string, entries: readonly Handover[]): Promise<void> {
  const lines = entries.map((entry) => JSON.stringify(entry));
  await addLines(agentFile(session, 'main', 'handover'), lines);
}

export async function handedAgents(session: string): Promise<ReadonlySet<string>> {
  const path = agentFile(session, 'main', 'handover');
  if (!existsSync(path)) return new Set();
  const lines = nonEmptyLines(await readFile(path, 'utf8'));
  return new Set(lines.map((line) => parseState(path, line, handoverLine).agent));
}

export async function takeHandover(session: string): Promise<Handover[]> {
  const path = agentFile(session, 'main', 'handover');
  const lines = await takeLines(path);
  try {
    return lines.map((line) => parseState(path, line, handoverLine));
  } catch (error) {
    await addLines(path, lines);
    throw error;
  }
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
