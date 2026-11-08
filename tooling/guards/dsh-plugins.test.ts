import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files.ts';

const PLUGIN_FOLDER = 'packages/harness/src/plugins/';

const CURRENT_SOURCES: ReadonlySet<string> = new Set([
  'packages/harness/src/composition/claude-plugins.ts',
  'packages/harness/src/composition/human-commands.ts',
  'packages/harness/src/composition/working-directory.ts',
  'packages/harness/src/host/runtime.ts',
  'apps/hub/src/harness/prompt.ts',
]);

const SCANNED_ROOTS: readonly string[] = [
  'apps/hub/src',
  'apps/desktop/src',
  'packages/domain/src',
  'packages/harness/src',
];

const HUB_PLUGIN_HOST = 'apps/hub/src/plugins/';

const SOURCE = /\.tsx?$/u;
const NOT_SOURCE = /\.d\.ts$|\.test\.tsx?$/u;

function registrations(path: string, text: string): readonly string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const owner = node.expression.expression;
      const service = ts.isPropertyAccessExpression(owner) ? owner.name.text : '';
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

function allowed(path: string): boolean {
  return (
    path.startsWith(PLUGIN_FOLDER) || path.startsWith(HUB_PLUGIN_HOST) || CURRENT_SOURCES.has(path)
  );
}

function offenders(files: ReadonlyMap<string, string>): readonly string[] {
  return [...files]
    .filter(([path]) => !allowed(path))
    .flatMap(([path, text]) => registrations(path, text).map((call) => `${path}: ${call}`));
}

function repositorySources(): ReadonlyMap<string, string> {
  return new Map(
    SCANNED_ROOTS.flatMap((root) => filesUnder(join(repositoryRoot, root)))
      .filter((file) => SOURCE.test(file) && !NOT_SOURCE.test(file))
      .map((file) => [relative(repositoryRoot, file), readFileSync(file, 'utf8')]),
  );
}

describe('dsh plugin registrations', () => {
  it('happen only in plugin files and the listed current sources', () => {
    expect(offenders(repositorySources())).toStrictEqual([]);
  });

  it('keeps every listed current source real', () => {
    const files = repositorySources();
    const live = [...CURRENT_SOURCES].filter(
      (path) => registrations(path, files.get(path) ?? '').length > 0,
    );

    expect(live.sort()).toStrictEqual([...CURRENT_SOURCES].sort());
  });

  it.each([
    ['a tool', 'ctx.tools.register({ name: "x" });', 'tools.register'],
    ['a command', 'scope.commands.register({ name: "x" });', 'commands.register'],
    ['a prompt section', 'agentCtx.systemPrompt.section({ name: "x" });', 'systemPrompt.section'],
    ['a prompt context', 'ready.systemPrompt.context({ name: "x" });', 'systemPrompt.context'],
  ])('fails when %s is planted outside a plugin file', (_label, code, call) => {
    const planted = new Map([['packages/harness/src/composition/planted.ts', code]]);

    expect(offenders(planted)).toStrictEqual([
      `packages/harness/src/composition/planted.ts: ${call}`,
    ]);
  });

  it('accepts the same call inside the plugin folder', () => {
    const inside = new Map([[`${PLUGIN_FOLDER}goals.ts`, 'ctx.tools.register({ name: "goal" });']]);

    expect(offenders(inside)).toStrictEqual([]);
  });

  it('ignores calls on other services', () => {
    const other = new Map([
      ['packages/harness/src/composition/other.ts', 'ctx.skills.register(1); ctx.tools.get("x");'],
    ]);

    expect(offenders(other)).toStrictEqual([]);
  });
});
