import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative } from 'node:path';
import { z } from 'zod';
import { HarnessRuntimeError, loadPlugin, parseMarkdownFile } from '@smarteverything/harness';
import {
  ApiError,
  HARNESS_EXTENSION_NAME,
  HARNESS_RELATIVE_PATH,
  type HarnessExtensionCandidate,
  type HarnessExtensionSourceRequest,
} from '@smarteverything/domain';
import { isMissing } from '../fs-util';

const PLUGIN_MANIFEST = join('.claude-plugin', 'plugin.json');
const PLUGIN_PARTS = ['commands', 'agents', 'hooks', '.mcp.json', '.claude-plugin'];
const MARKETPLACE_SOURCE = z.union([
  z.string(),
  z.object({ source: z.literal('github'), repo: z.string(), ref: z.string().optional() }),
  z.object({
    source: z.enum(['url', 'git-subdir']),
    url: z.string(),
    ref: z.string().optional(),
    path: z.string().optional(),
  }),
]);
const MARKETPLACE = z.object({
  name: z.string(),
  owner: z.object({ name: z.string() }).optional(),
  plugins: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      license: z.string().optional(),
      source: MARKETPLACE_SOURCE,
      skills: z.array(z.string()).optional(),
    }),
  ),
});
const MANIFEST = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  license: z.string().optional(),
});
type MarketplaceEntry = z.infer<typeof MARKETPLACE>['plugins'][number];

export type Candidate = HarnessExtensionCandidate;

export interface Marketplace {
  readonly name: string;
  readonly owner: string | null;
  readonly candidates: readonly Candidate[];
}

export async function inspect(root: string, path: string | null): Promise<readonly Candidate[]> {
  const marketplace = await readMarketplace(root, path);
  if (marketplace !== undefined) return marketplace.candidates;
  const here = relativePath(path ?? '');
  const directory = await resolved(root, here);
  if (await isFile(join(directory, 'SKILL.md')))
    return [await skillAt(directory, here, basename(directory))];
  const plugin = await pluginAt(directory, here);
  if (plugin !== undefined) return [plugin];
  const skills = await skillsBelow(directory, here);
  if (skills.length === 0)
    throw new ApiError(
      'invalid_request',
      'Nothing installable here: expected a SKILL.md, a plugin or a marketplace.json.',
    );
  return skills;
}

export async function readMarketplace(
  root: string,
  path: string | null,
): Promise<Marketplace | undefined> {
  const file = join(await resolved(root, path ?? ''), '.claude-plugin', 'marketplace.json');
  if (!(await isFile(file))) return undefined;
  const listing = MARKETPLACE.parse(JSON.parse(await readFile(file, 'utf8')));
  const candidates = await Promise.all(
    listing.plugins.map((entry) => marketplaceEntry(root, entry)),
  );
  return { name: listing.name, owner: listing.owner?.name ?? null, candidates: candidates.flat() };
}

async function marketplaceEntry(
  root: string,
  entry: MarketplaceEntry,
): Promise<readonly Candidate[]> {
  requireName('plugin', entry.name);
  const remote = remoteSource(entry.source);
  const path = typeof entry.source === 'string' ? relativePath(entry.source) : '';
  if (remote === undefined && entry.skills !== undefined)
    return Promise.all(
      entry.skills.map(async (skill) => {
        const at = relativePath(posix.join(path, skill));
        return skillAt(await resolved(root, at), at, basename(at));
      }),
    );
  return [
    {
      kind: 'plugin',
      name: entry.name,
      description: entry.description ?? `The ${entry.name} plugin.`,
      path,
      license: entry.license ?? null,
      executes: remote === undefined && (await executes(await resolved(root, path))),
      ...(remote === undefined ? {} : { source: remote }),
    },
  ];
}

function relativePath(value: string): string {
  const path = posix.normalize(value).replace(/\/$/u, '');
  if (path === '.') return '';
  const checked = HARNESS_RELATIVE_PATH.safeParse(path);
  if (!checked.success)
    throw new ApiError('invalid_request', `"${value}" is not a folder inside its source.`);
  return checked.data;
}

export async function resolved(root: string, path: string): Promise<string> {
  const base = await realpath(root);
  const wanted = join(base, relativePath(path));
  const target = await realpath(wanted).catch((cause: unknown) => {
    if (isMissing(cause)) return wanted;
    throw cause;
  });
  const inside = relative(base, target);
  if (inside.startsWith('..') || isAbsolute(inside))
    throw new ApiError('invalid_request', `"${path}" leaves its source.`);
  return target;
}

function remoteSource(
  source: z.infer<typeof MARKETPLACE_SOURCE>,
): HarnessExtensionSourceRequest | undefined {
  if (typeof source === 'string') return undefined;
  if (source.source === 'github') return request(source.repo, source.ref);
  return request(source.url, source.ref, source.path);
}

function request(url: string, ref?: string, path?: string): HarnessExtensionSourceRequest {
  return {
    url,
    ...(ref === undefined ? {} : { ref }),
    ...(path === undefined ? {} : { path }),
  };
}

async function skillAt(directory: string, path: string, fallback: string): Promise<Candidate> {
  const { frontmatter } = parseMarkdownFile(await readFile(join(directory, 'SKILL.md'), 'utf8'));
  const name = frontmatter.name ?? fallback;
  requireName('skill', name);
  return {
    kind: 'skill',
    name,
    description: frontmatter.description ?? `The ${name} skill.`,
    path,
    license: frontmatter.license ?? null,
    executes: false,
  };
}

async function pluginAt(directory: string, path: string): Promise<Candidate | undefined> {
  const entries = await listFolder(directory);
  if (!entries.some((entry) => PLUGIN_PARTS.includes(entry.name))) return undefined;
  const manifest = await readManifest(directory);
  const name = manifest.name ?? basename(directory);
  requireName('plugin', name);
  return {
    kind: 'plugin',
    name,
    description: manifest.description ?? `The ${name} plugin.`,
    path,
    license: manifest.license ?? null,
    executes: await executes(directory),
  };
}

function requireName(kind: string, name: string): void {
  if (!HARNESS_EXTENSION_NAME.safeParse(name).success)
    throw new ApiError('invalid_request', `The ${kind} name "${name}" is not a valid folder name.`);
}

async function readManifest(directory: string): Promise<z.infer<typeof MANIFEST>> {
  const file = join(directory, PLUGIN_MANIFEST);
  if (!(await isFile(file))) return {};
  return MANIFEST.parse(JSON.parse(await readFile(file, 'utf8')));
}

async function listFolder(folder: string): Promise<readonly Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
}

async function skillsBelow(directory: string, path: string): Promise<readonly Candidate[]> {
  for (const parent of ['skills', '']) {
    const folder = join(directory, parent);
    const entries = await listFolder(folder);
    const found: Candidate[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !(await isFile(join(folder, entry.name, 'SKILL.md')))) continue;
      const at = [path, parent, entry.name].filter((part) => part !== '').join('/');
      found.push(await skillAt(join(folder, entry.name), at, entry.name));
    }
    if (found.length > 0) return found;
  }
  return [];
}

export async function refreshed(
  root: string,
  path: string | null,
  known: Pick<Candidate, 'kind' | 'name' | 'description' | 'license'>,
): Promise<Candidate> {
  const directory = await resolved(root, path ?? '');
  if (!(await isDirectory(directory)))
    throw new ApiError('conflict', `${known.name} is no longer in its source.`);
  if (known.kind === 'plugin') return refreshedPlugin(directory, path ?? '', known);
  const skill = await skillAt(directory, path ?? '', known.name);
  if (skill.name !== known.name)
    throw new ApiError('conflict', `${known.name} is now called ${skill.name} in its source.`);
  return skill;
}

async function refreshedPlugin(
  directory: string,
  path: string,
  known: Pick<Candidate, 'kind' | 'name' | 'description' | 'license'>,
): Promise<Candidate> {
  const manifest = await readManifest(directory);
  if (manifest.name !== undefined && manifest.name !== known.name)
    throw new ApiError('conflict', `${known.name} is now called ${manifest.name} in its source.`);
  return {
    ...known,
    description: manifest.description ?? known.description,
    license: manifest.license ?? known.license,
    path,
    executes: await executes(directory),
  };
}

async function executes(directory: string): Promise<boolean> {
  const [hooks, servers] = await Promise.all([
    isFile(join(directory, 'hooks', 'hooks.json')),
    isFile(join(directory, '.mcp.json')),
  ]);
  return hooks || servers;
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (entry) => entry.isDirectory(),
    () => false,
  );
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (entry) => entry.isFile(),
    () => false,
  );
}

export async function prepared(folder: string, candidate: Candidate): Promise<void> {
  const manifest = join(folder, PLUGIN_MANIFEST);
  if (
    !(await stat(manifest).then(
      () => true,
      () => false,
    ))
  ) {
    await mkdir(dirname(manifest), { recursive: true });
    await writeFile(
      manifest,
      JSON.stringify({ name: candidate.name, description: candidate.description }),
    );
  }
  try {
    await loadPlugin(folder);
  } catch (cause) {
    if (cause instanceof HarnessRuntimeError) throw new ApiError('invalid_request', cause.message);
    throw cause;
  }
}

export function choose(
  candidates: readonly Candidate[],
  select: readonly string[],
): readonly Candidate[] {
  if (select.length > 0) {
    const chosen = candidates.filter((candidate) => select.includes(candidate.name));
    const missing = select.filter((name) => !chosen.some((candidate) => candidate.name === name));
    if (missing.length > 0)
      throw new ApiError('invalid_request', `Not offered by this source: ${missing.join(', ')}.`);
    return chosen;
  }
  if (candidates.length === 1) return candidates;
  throw new ApiError(
    'invalid_request',
    `This source offers ${candidates.map((candidate) => candidate.name).join(', ')}; choose which to install.`,
  );
}
