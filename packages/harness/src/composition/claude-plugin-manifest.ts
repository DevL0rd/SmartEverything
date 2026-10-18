import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import { Logger } from '@smarteverything/logging';
import { MCP_FILE, MCP_SERVER, type McpServerEntry } from './claude-plugin-mcp';

const MANIFEST_PATH = ['.claude-plugin', 'plugin.json'] as const;
const MARKDOWN_NAME = /^[a-z][a-z0-9_-]*$/u;
const MANIFEST = z.looseObject({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  license: z.string().optional(),
});
const FRONTMATTER_KEYS = ['name', 'description', 'model', 'argument-hint', 'license'] as const;
const log = new Logger('hub.plugins');
const YAML_MAPPING = z.record(z.string(), z.unknown());

export type Frontmatter = Readonly<Partial<Record<(typeof FRONTMATTER_KEYS)[number], string>>>;

export interface ClaudeCommandFile {
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string;
  readonly body: string;
  readonly path: string;
}
export interface ClaudeAgentFile {
  readonly name: string;
  readonly description?: string;
  readonly model?: string;
  readonly body: string;
  readonly path: string;
}
export interface LoadedPlugin {
  readonly root: string;
  readonly metadata: {
    readonly name: string;
    readonly description?: string;
    readonly license?: string;
  };
  readonly components: {
    readonly commands: readonly ClaudeCommandFile[];
    readonly agents: readonly ClaudeAgentFile[];
    readonly hooksFile?: string;
    readonly mcpServers: Readonly<Record<string, McpServerEntry>>;
  };
}

export function pluginSkillsDirectory(plugin: Pick<LoadedPlugin, 'root'>): string {
  return join(plugin.root, 'skills');
}

export async function loadPlugin(root: string): Promise<LoadedPlugin> {
  const resolved = resolve(root);
  const manifestPath = join(resolved, ...MANIFEST_PATH);
  const manifest = parseFile(
    MANIFEST,
    JSON.parse(await readFile(manifestPath, 'utf8')),
    manifestPath,
  );
  const hooksFile = join(resolved, 'hooks', 'hooks.json');
  const mcpFile = join(resolved, '.mcp.json');
  const [commands, agents, hooks, mcp] = await Promise.all([
    markdownFiles(join(resolved, 'commands')),
    markdownFiles(join(resolved, 'agents')),
    readOptional(hooksFile),
    readOptional(mcpFile),
  ]);
  return {
    root: resolved,
    metadata: {
      name: manifest.name,
      ...(manifest.description === undefined ? {} : { description: manifest.description }),
      ...(manifest.license === undefined ? {} : { license: manifest.license }),
    },
    components: {
      commands: usableFiles(manifest.name, commands, commandFile),
      agents: usableFiles(manifest.name, agents, agentFile),
      ...(hooks === undefined ? {} : { hooksFile }),
      mcpServers: mcp === undefined ? {} : usableMcpServers(manifest.name, mcp, mcpFile),
    },
  };
}

function usableFiles<File>(
  pluginName: string,
  sources: readonly MarkdownSource[],
  build: (source: MarkdownSource) => File,
): readonly File[] {
  const usable: File[] = [];
  for (const source of sources) {
    try {
      usable.push(build(source));
    } catch (error) {
      if (!(error instanceof HarnessRuntimeError)) throw error;
      log.warn('plugin.file_unusable', {
        plugin: pluginName,
        path: source.path,
        reason: error.message,
      });
    }
  }
  return usable;
}

function usableMcpServers(
  pluginName: string,
  text: string,
  path: string,
): Readonly<Record<string, McpServerEntry>> {
  const declared = parseFile(MCP_FILE, JSON.parse(text), path).mcpServers ?? {};
  const usable: Record<string, McpServerEntry> = {};
  for (const [serverKey, candidate] of Object.entries(declared)) {
    const parsed = MCP_SERVER.safeParse(candidate);
    if (parsed.success) usable[serverKey] = parsed.data;
    else
      log.warn('plugin.mcp_server_unusable', {
        plugin: pluginName,
        server: serverKey,
        reason: z.prettifyError(parsed.error),
      });
  }
  return usable;
}

export function parseMarkdownFile(text: string): {
  readonly frontmatter: Frontmatter;
  readonly body: string;
} {
  const lines = text.replace(/^\uFEFF/u, '').split(/\r\n|\n|\r/u);
  const closing = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (closing === -1) return { frontmatter: {}, body: text };
  return {
    frontmatter: readFrontmatter(lines.slice(1, closing)),
    body: lines
      .slice(closing + 1)
      .join('\n')
      .replace(/^\n+/u, ''),
  };
}

function readFrontmatter(lines: readonly string[]): Frontmatter {
  const mapping = yamlMapping(lines.join('\n'));
  const result: { -readonly [Key in keyof Frontmatter]: string } = {};
  for (const key of FRONTMATTER_KEYS) {
    const value = mapping?.[key];
    if (typeof value === 'string') result[key] = value;
    else if (mapping === undefined || (value !== undefined && value !== null)) {
      const line = lines.map((entry) => entry.match(lineOf(key))?.[1]).find((v) => v !== undefined);
      if (line !== undefined) result[key] = line;
    }
  }
  return result;
}

function yamlMapping(text: string): z.infer<typeof YAML_MAPPING> | undefined {
  const document = parseDocument(text);
  if (document.errors.length > 0) return undefined;
  const parsed = YAML_MAPPING.safeParse(document.toJS() ?? {});
  return parsed.success ? parsed.data : undefined;
}

function lineOf(key: string): RegExp {
  return new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, 'u');
}

function commandFile(source: MarkdownSource): ClaudeCommandFile {
  const { frontmatter, body } = parseMarkdownFile(source.text);
  const name = validName(basename(source.path, '.md'), source.path);
  const trimmed = nonEmptyBody(body, source.path);
  return {
    name,
    description: presentText(frontmatter.description) ?? firstLine(trimmed),
    ...(frontmatter['argument-hint'] === undefined
      ? {}
      : { argumentHint: frontmatter['argument-hint'] }),
    body: trimmed,
    path: source.path,
  };
}

function agentFile(source: MarkdownSource): ClaudeAgentFile {
  const { frontmatter, body } = parseMarkdownFile(source.text);
  const name = validName(frontmatter.name ?? basename(source.path, '.md'), source.path);
  const description = presentText(frontmatter.description);
  const model = presentText(frontmatter.model);
  return {
    name,
    ...(description === undefined ? {} : { description }),
    ...(model === undefined ? {} : { model }),
    body: nonEmptyBody(body, source.path),
    path: source.path,
  };
}

interface MarkdownSource {
  readonly path: string;
  readonly text: string;
}

async function markdownFiles(directory: string): Promise<readonly MarkdownSource[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(absentAsEmpty);
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const path = join(directory, name);
      return { path, text: await readFile(path, 'utf8') };
    }),
  );
}

async function readOptional(path: string): Promise<string | undefined> {
  return readFile(path, 'utf8').catch(absentAsUndefined);
}

function absentAsEmpty(error: unknown): never[] {
  absentAsUndefined(error);
  return [];
}

function absentAsUndefined(error: unknown): undefined {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
  throw error;
}

function validName(name: string, path: string): string {
  if (!MARKDOWN_NAME.test(name))
    throw new HarnessRuntimeError(
      'composition_incompatible',
      `The name "${name}" in ${path} is not valid.`,
    );
  return name;
}

function presentText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function nonEmptyBody(body: string, path: string): string {
  const trimmed = body.trim();
  if (trimmed === '')
    throw new HarnessRuntimeError('composition_incompatible', `${path} has an empty body.`);
  return trimmed;
}

function firstLine(body: string): string {
  return (
    body
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  );
}

function parseFile<T extends z.ZodType>(schema: T, value: unknown, path: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new HarnessRuntimeError(
    'composition_incompatible',
    `${path} is not a valid Claude plugin file: ${z.prettifyError(parsed.error)}`,
  );
}
