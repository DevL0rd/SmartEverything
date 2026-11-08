import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative } from 'node:path';
import { z } from 'zod';
import {
  HarnessRuntimeError,
  loadPlugin,
  parseMarkdownFile,
  harnessTreeHash,
  readHarnessTree,
  type LoadedPlugin,
} from '@smarteverything/harness';
import {
  ApiError,
  HARNESS_EXTENSION_NAME,
  HARNESS_RELATIVE_PATH,
  type HarnessExtensionCandidate,
  type HarnessExtensionSourceRequest,
  type HarnessExtensionTree,
} from '@smarteverything/domain';
import { isMissing } from '../fs-util';
import type { CheckedOutSource } from './extension-source';

const PLUGIN_MANIFEST = join('.claude-plugin', 'plugin.json');
const LISTED_MANIFEST = '.claude-plugin/plugin.json';
const SKILL_FILE = 'SKILL.md';
const PLUGIN_PARTS = ['commands', 'hooks', '.mcp.json', '.claude-plugin'];
const GIT_REVISION = {
  ref: z.string().optional(),
  sha: z
    .string()
    .regex(/^[a-f0-9]{40}$/u)
    .optional(),
};
const MARKETPLACE_SOURCE = z.union([
  z.string(),
  z.object({ source: z.literal('github'), repo: z.string(), ...GIT_REVISION }),
  z.object({
    source: z.enum(['url', 'git-subdir']),
    url: z.string(),
    path: z.string().optional(),
    ...GIT_REVISION,
  }),
  z.object({ source: z.literal('command'), command: z.string(), mode: z.string().optional() }),
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

export async function inspect(
  checkout: Pick<CheckedOutSource, 'directory' | 'files'>,
  path: string | null,
): Promise<readonly Candidate[]> {
  const root = checkout.directory;
  const marketplace = await readMarketplace(root, path);
  if (marketplace !== undefined) return marketplace.candidates;
  const here = relativePath(path ?? '');
  const directory = await resolved(root, here);
  if (await isFile(join(directory, SKILL_FILE)))
    return [await skillAt(directory, here, basename(directory))];
  const plugin = await pluginAt(directory, here);
  if (plugin !== undefined) return [plugin];
  const found = await nested(root, checkout.files, here);
  if (found.length === 0)
    throw new ApiError(
      'invalid_request',
      'Nothing installable here: expected a SKILL.md, a plugin (.claude-plugin/plugin.json, commands, hooks or .mcp.json) or a .claude-plugin/marketplace.json. Other formats such as AGENTS.md or .cursor/rules are not supported.',
    );
  return found;
}

async function nested(
  root: string,
  files: readonly string[],
  here: string,
): Promise<readonly Candidate[]> {
  const below = files.filter((file) => here === '' || file.startsWith(`${here}/`));
  const plugins = folders(below, LISTED_MANIFEST).map((folder) => posix.dirname(folder));
  const skills = folders(below, SKILL_FILE).filter(
    (folder) => !plugins.some((plugin) => inside(folder, plugin)),
  );
  const outermost = (list: readonly string[]): readonly string[] =>
    list.filter((folder) => !list.some((other) => other !== folder && inside(folder, other)));
  const found: Candidate[] = [];
  for (const folder of [...outermost(plugins), ...outermost(skills)].sort()) {
    const directory = await resolved(root, folder);
    const plugin = plugins.includes(folder) ? await pluginAt(directory, folder) : undefined;
    found.push(plugin ?? (await skillAt(directory, folder, posix.basename(folder))));
  }
  return found;
}

function folders(files: readonly string[], name: string): readonly string[] {
  return files
    .filter((file) => file === name || file.endsWith(`/${name}`))
    .map((file) => posix.dirname(file))
    .map((folder) => (folder === '.' ? '' : folder))
    .filter((folder) => folder !== '');
}

function inside(folder: string, parent: string): boolean {
  return folder.startsWith(`${parent}/`);
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
  if (typeof entry.source !== 'string' && entry.source.source === 'command') return [];
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
  source: Exclude<z.infer<typeof MARKETPLACE_SOURCE>, { source: 'command' }>,
): HarnessExtensionSourceRequest | undefined {
  if (typeof source === 'string') return undefined;
  const revision = source.sha ?? source.ref;
  if (source.source === 'github') return request(source.repo, revision);
  return request(source.url, revision, source.path);
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

export async function candidateTree(
  folder: string,
  candidate: Candidate,
): Promise<HarnessExtensionTree> {
  const manifest = join(folder, PLUGIN_MANIFEST);
  if (candidate.kind === 'plugin' && !(await isFile(manifest))) {
    await mkdir(dirname(manifest), { recursive: true });
    await writeFile(
      manifest,
      JSON.stringify({ name: candidate.name, description: candidate.description }),
    );
  }
  return readHarnessTree(folder);
}

export async function availableVersion(root: string, candidate: Candidate): Promise<string | null> {
  if (candidate.source !== undefined) return null;
  const folder = await resolved(root, candidate.path);
  if (!(await isDirectory(folder))) return null;
  return harnessTreeHash(await candidateTree(folder, candidate));
}

export async function checkedPlugin(folder: string): Promise<LoadedPlugin> {
  try {
    return await loadPlugin(folder);
  } catch (cause) {
    if (cause instanceof HarnessRuntimeError) throw new ApiError('invalid_request', cause.message);
    throw cause;
  }
}

export function offered(
  candidates: readonly Candidate[],
  id: string,
  matchesOrigin?: (candidate: Candidate) => boolean,
): Candidate {
  const matching = candidates.filter(
    (candidate) =>
      `${candidate.kind}:${candidate.name}` === id && (matchesOrigin?.(candidate) ?? true),
  );
  const [only] = matching;
  if (only === undefined)
    throw new ApiError('not_found', `${id} is not offered by this source at that snapshot.`);
  if (matchesOrigin === undefined && matching.length > 1)
    throw new ApiError('conflict', `This source offers several items called ${id}.`);
  return only;
}

export function sole(candidates: readonly Candidate[]): Candidate {
  const [only] = candidates;
  if (only === undefined || candidates.length > 1)
    throw new ApiError(
      'invalid_request',
      `The linked source offers ${candidates.map((candidate) => candidate.name).join(', ')}; it must offer exactly one.`,
    );
  return only;
}
