import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository-files.ts';

const PLUGIN_FOLDERS: readonly string[] = [
  'packages/harness/src/plugins/',
  'apps/hub/src/plugins/',
];

const REGISTERING_SOURCES: ReadonlySet<string> = new Set([
  'packages/harness/src/composition/claude-plugins.ts',
  'packages/harness/src/composition/human-commands.ts',
  'packages/harness/src/composition/working-directory.ts',
  'packages/harness/src/host/runtime.ts',
  'apps/hub/src/harness/prompt.ts',
]);

const CHAT_ENDPOINT_HOMES: ReadonlySet<string> = new Set([
  'apps/hub/src/harness/transport.ts',
  'apps/hub/src/openrouter/media-notes.ts',
]);

const SCANNED_ROOTS: readonly string[] = [
  'apps/hub/src',
  'apps/desktop/src',
  'apps/app/src',
  'packages/ble/src',
  'packages/domain/src',
  'packages/flow/src',
  'packages/harness/src',
  'packages/ipp/src',
  'packages/logging/src',
  'packages/models/src',
  'packages/shelly/src',
  'packages/smartthings/src',
  'packages/tuya/src',
  'packages/xiaomi/src',
];

const DELETED_NAMES: readonly string[] = [
  'TurnAccumulator',
  'OneShotSession',
  'ONE_SHOT_TOOL_STEPS',
  'ONE_SHOT_TIMEOUT_MS',
  'coordinationLimits',
  'CoordinationLimits',
  'DEADLOCK_TEXT',
  'TOO_MANY_HOPS',
];

const DELETED_PATHS: readonly string[] = [
  'apps/hub/src/assistant/coordination',
  'apps/hub/src/store/repositories/harness-coordination.ts',
  'apps/hub/src/store/repositories/ai-child-agent-removal.ts',
  'apps/hub/src/openrouter/chat-types.ts',
  'apps/hub/src/openrouter/sse.ts',
  'apps/hub/src/openrouter/stream.ts',
  'apps/hub/src/openrouter/turn.ts',
];

const SOURCE = /\.tsx?$/u;
const NOT_SOURCE = /\.d\.ts$|\.test\.tsx?$/u;
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', 'dist', 'build']);
const CHAT_ENDPOINT = '/chat/completions';

function registrations(path: string, text: string): readonly string[] {
  if (!text.includes('.register(') && !text.includes('systemPrompt')) return [];
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const owner = node.expression.expression;
      const service = ts.isPropertyAccessExpression(owner) ? owner.name.text : '';
      const method = node.expression.name.text;
      if (
        (service === 'tools' && method === 'register') ||
        (service === 'commands' && method === 'register') ||
        service === 'systemPrompt'
      )
        found.push(`${service}.${method}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function inPluginFolder(path: string): boolean {
  return PLUGIN_FOLDERS.some((folder) => path.startsWith(folder));
}

function registrationOffenders(files: ReadonlyMap<string, string>): readonly string[] {
  return [...files]
    .filter(([path]) => !inPluginFolder(path) && !REGISTERING_SOURCES.has(path))
    .flatMap(([path, text]) => registrations(path, text).map((call) => `${path}: ${call}`));
}

function chatEndpointOffenders(files: ReadonlyMap<string, string>): readonly string[] {
  return [...files]
    .filter(([path, text]) => path.startsWith('apps/hub/src/') && text.includes(CHAT_ENDPOINT))
    .map(([path]) => path)
    .filter((path) => !CHAT_ENDPOINT_HOMES.has(path));
}

function deletedNameOffenders(files: ReadonlyMap<string, string>): readonly string[] {
  return [...files].flatMap(([path, text]) =>
    DELETED_NAMES.filter((name) => new RegExp(`\\b${name}\\b`, 'u').test(text)).map(
      (name) => `${path}: ${name}`,
    ),
  );
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const at = join(directory, entry.name);
      if (!entry.isDirectory()) return [at];
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : walk(at);
    }),
  );
  return nested.flat();
}

async function sources(): Promise<ReadonlyMap<string, string>> {
  const found = await Promise.all(SCANNED_ROOTS.map((root) => walk(join(repositoryRoot, root))));
  const paths = found
    .flat()
    .map((file) => relative(repositoryRoot, file).replaceAll('\\', '/'))
    .filter((path) => SOURCE.test(path) && !NOT_SOURCE.test(path));
  const entries = await Promise.all(
    paths.map(async (path): Promise<[string, string]> => [
      path,
      await readFile(join(repositoryRoot, path), 'utf8'),
    ]),
  );
  return new Map(entries);
}

describe('no ad-hoc dsh glue', () => {
  let files: ReadonlyMap<string, string> = new Map();

  beforeAll(async () => {
    files = await sources();
  });

  it('registers tools, commands and prompt sections only from plugin files', () => {
    expect(registrationOffenders(files)).toStrictEqual([]);
  });

  it('has no second chat client beside the metered route', () => {
    expect(chatEndpointOffenders(files)).toStrictEqual([]);
  });

  it('has none of the deleted names', () => {
    expect(deletedNameOffenders(files)).toStrictEqual([]);
  });

  it.each(DELETED_PATHS)('has deleted %s', (path) => {
    expect(existsSync(join(repositoryRoot, path))).toBe(false);
  });

  it.each([
    ['a tool', 'ctx.tools.register({ name: "x" });', 'tools.register'],
    ['a command', 'scope.commands.register({ name: "x" });', 'commands.register'],
    ['a prompt section', 'agentCtx.systemPrompt.section({ name: "x" });', 'systemPrompt.section'],
  ])('fails when %s is planted outside a plugin file', (_label, code, call) => {
    const planted = new Map([['packages/harness/src/composition/planted.ts', code]]);

    expect(registrationOffenders(planted)).toStrictEqual([
      `packages/harness/src/composition/planted.ts: ${call}`,
    ]);
  });

  it('accepts a registration inside a plugin file', () => {
    const inside = new Map([['packages/harness/src/plugins/goals.ts', 'ctx.tools.register(1);']]);

    expect(registrationOffenders(inside)).toStrictEqual([]);
  });

  it('fails when a chat client is planted outside the metered route', () => {
    const planted = new Map([
      ['apps/hub/src/automations/planted.ts', 'fetch(`${base}/chat/completions`);'],
    ]);

    expect(chatEndpointOffenders(planted)).toStrictEqual(['apps/hub/src/automations/planted.ts']);
  });

  it('accepts the chat endpoint in the metered route', () => {
    const home = new Map([['apps/hub/src/harness/transport.ts', 'fetch("/chat/completions");']]);

    expect(chatEndpointOffenders(home)).toStrictEqual([]);
  });

  it('fails when a deleted name is planted', () => {
    const planted = new Map([['apps/hub/src/planted.ts', 'new OneShotSession(); const x = 1;']]);

    expect(deletedNameOffenders(planted)).toStrictEqual([
      'apps/hub/src/planted.ts: OneShotSession',
    ]);
  });
});
