import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { harnessTreeHash, parseMarkdownFile, type LoadedPlugin } from '@smarteverything/harness';
import { ApiError, JSON_VALUE, type HarnessExtensionPreview } from '@smarteverything/domain';
import { candidateTree, checkedPlugin, type Candidate } from './extension-inspect';

const MANIFEST = z.record(z.string(), JSON_VALUE);
const HOOKS = z.looseObject({
  hooks: z
    .record(
      z.string(),
      z.array(
        z.looseObject({
          matcher: z.string().optional(),
          hooks: z.array(
            z.looseObject({ type: z.string().min(1), command: z.string().optional() }),
          ),
        }),
      ),
    )
    .default({}),
});
const SCRIPT_FOLDER = /(^|\/)(scripts|bin)\//u;

export async function previewOf(
  folder: string,
  candidate: Candidate,
  origin: { readonly url: string; readonly commit: string },
): Promise<HarnessExtensionPreview> {
  const tree = await candidateTree(folder, candidate);
  const plugin = candidate.kind === 'plugin' ? await checkedPlugin(folder) : null;
  const files = tree.files.map((file) => ({
    path: file.path,
    bytes: Buffer.from(file.base64, 'base64').length,
    executable: file.executable === true,
  }));
  return {
    id: `${candidate.kind}:${candidate.name}`,
    kind: candidate.kind,
    name: candidate.name,
    description: candidate.description,
    license: candidate.license,
    source_url: origin.url,
    commit: origin.commit,
    version: harnessTreeHash(tree),
    manifest: await manifestOf(folder, candidate),
    files,
    hooks:
      plugin?.components.hooksFile === undefined ? [] : await hooksOf(plugin.components.hooksFile),
    mcp_servers: serversOf(plugin),
    scripts: files
      .filter((file) => file.executable || SCRIPT_FOLDER.test(file.path))
      .map((file) => file.path),
    executes: candidate.executes,
  };
}

function serversOf(plugin: LoadedPlugin | null): HarnessExtensionPreview['mcp_servers'] {
  return Object.entries(plugin?.components.mcpServers ?? {}).map(([name, server]) =>
    server.type === 'http'
      ? {
          name,
          transport: 'http',
          command: null,
          args: [],
          url: server.url,
          env: [],
          headers: Object.keys(server.headers ?? {}),
        }
      : {
          name,
          transport: 'stdio',
          command: server.command,
          args: server.args ?? [],
          url: null,
          env: Object.keys(server.env ?? {}),
          headers: [],
        },
  );
}

async function manifestOf(
  folder: string,
  candidate: Candidate,
): Promise<Readonly<Record<string, z.infer<typeof JSON_VALUE>>>> {
  if (candidate.kind === 'skill')
    return parseMarkdownFile(await readFile(join(folder, 'SKILL.md'), 'utf8')).frontmatter;
  return MANIFEST.parse(
    JSON.parse(await readFile(join(folder, '.claude-plugin', 'plugin.json'), 'utf8')),
  );
}

async function hooksOf(file: string): Promise<HarnessExtensionPreview['hooks']> {
  const parsed = HOOKS.safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!parsed.success)
    throw new ApiError(
      'invalid_request',
      `hooks/hooks.json is not in the hooks format: ${z.prettifyError(parsed.error)}`,
    );
  return Object.entries(parsed.data.hooks).flatMap(([event, groups]) =>
    groups.flatMap((group) =>
      group.hooks.map((hook) => ({
        event,
        matcher: group.matcher ?? null,
        type: hook.type,
        command: hook.command ?? null,
      })),
    ),
  );
}
