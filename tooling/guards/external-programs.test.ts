import { accessSync, constants, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isShipped } from '../build-service.ts';
import { BUNDLED_PACKAGES, DYNAMIC_SITES, PROGRAMS } from './external-programs.allow.ts';
import { filesUnder, repositoryRoot } from './repository-files.ts';

const DYNAMIC = '<dynamic>';
const SPAWNERS = new Set([
  'spawn',
  'spawnSync',
  'execFile',
  'execFileSync',
  'fork',
  'run',
  'runProgram',
]);
const PROCESS_FILE =
  /from '(?:node:)?child_process'|\b(?:RunProgram|runProgram|RunCommand|CommandResult|CommandFailedError|ServiceSystem|FirewallSystem)\b/u;
const SHELL_EXEC_IMPORT =
  /import\s*\{[^}]*\bexec(?:Sync)?\b[^}]*\}\s*from\s*'(?:node:)?child_process'/u;
const SOURCE_FILE = /\.tsx?$/u;
const NOT_SHIPPED_SOURCE = /\.d\.ts$|\.test\.tsx?$|[\\/](?:node_modules|dist|vendor)[\\/]/u;

const HUB_MANIFEST = z.object({ dependencies: z.record(z.string(), z.string()) });

function shippedRoots(): readonly string[] {
  return [
    join(repositoryRoot, 'apps', 'hub', 'src'),
    join(repositoryRoot, 'apps', 'desktop', 'src'),
    ...['domain', 'harness', 'ble', 'ipp', 'tuya', 'xiaomi', 'smartthings', 'logging'].map((name) =>
      join(repositoryRoot, 'packages', name, 'src'),
    ),
  ];
}

function constantsOf(file: ts.SourceFile): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      found.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
}

function runsScriptInShell(call: ts.CallExpression): boolean {
  const callee = call.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'run' &&
    /shell$/iu.test(callee.expression.getText())
  );
}

function programOf(argument: ts.Expression, constants: ReadonlyMap<string, string>): string {
  if (ts.isStringLiteralLike(argument)) return argument.text;
  if (ts.isIdentifier(argument)) return constants.get(argument.text) ?? DYNAMIC;
  if (ts.isCallExpression(argument) && ts.isIdentifier(argument.expression)) {
    return `${argument.expression.text}()`;
  }
  return DYNAMIC;
}

function programsIn(fileName: string, source: string): readonly string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const constants = constantsOf(file);
  const spawnsProcesses = PROCESS_FILE.test(source);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (spawnsProcesses && ts.isCallExpression(node)) {
      const name = calleeName(node);
      const first = node.arguments[0];
      if (name !== null && SPAWNERS.has(name) && first !== undefined && !runsScriptInShell(node)) {
        found.push(programOf(first, constants));
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(file) === 'program' &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      found.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function scanned(): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, readonly string[]>();
  for (const root of shippedRoots()) {
    for (const file of filesUnder(root)) {
      if (!SOURCE_FILE.test(file) || NOT_SHIPPED_SOURCE.test(file)) continue;
      const programs = programsIn(file, readFileSync(file, 'utf8'));
      if (programs.length > 0)
        result.set(relative(repositoryRoot, file).replace(/\\/gu, '/'), programs);
    }
  }
  return result;
}

describe('programs the product starts', () => {
  const sites = scanned();

  it('starts only programs listed with a kind and a reason', () => {
    const unlisted = [...sites].flatMap(([file, programs]) =>
      programs
        .filter((program) =>
          program === DYNAMIC ? !(file in DYNAMIC_SITES) : !(program in PROGRAMS),
        )
        .map((program) => `${file}: ${program}`),
    );
    expect(unlisted).toStrictEqual([]);
  });

  it('lists no program or dynamic site that the source no longer starts', () => {
    const literals = new Set([...sites.values()].flat());
    const staleProgram = Object.keys(PROGRAMS).filter((program) => !literals.has(program));
    const staleSite = Object.keys(DYNAMIC_SITES).filter(
      (file) => !(sites.get(file) ?? []).includes(DYNAMIC),
    );
    expect([...staleProgram, ...staleSite]).toStrictEqual([]);
  });

  it('gives every entry a real reason', () => {
    const entries = [...Object.values(PROGRAMS), ...Object.values(DYNAMIC_SITES)];
    expect(entries.filter((entry) => entry.reason.trim().length < 20)).toStrictEqual([]);
  });

  it('never goes through a shell string', () => {
    const shelling = shippedRoots()
      .flatMap((root) => filesUnder(root))
      .filter((file) => SOURCE_FILE.test(file) && !NOT_SHIPPED_SOURCE.test(file))
      .filter((file) => SHELL_EXEC_IMPORT.test(readFileSync(file, 'utf8')));
    expect(shelling).toStrictEqual([]);
  });

  it('fails on a planted program that is not listed', () => {
    const planted = programsIn(
      'planted.ts',
      "import { spawn } from 'node:child_process';\nspawn('imagemagick', ['convert']);\nconst tool = 'sox';\nspawn(tool, []);\nspawn(pick(), []);\n",
    );
    expect(planted).toStrictEqual(['imagemagick', 'sox', 'pick()']);
    expect(planted.filter((program) => !(program in PROGRAMS))).toStrictEqual([
      'imagemagick',
      'sox',
      'pick()',
    ]);
  });

  it('ignores a run call in a file that cannot start processes', () => {
    expect(programsIn('plain.ts', "queue.run('capture');\n")).toStrictEqual([]);
  });
});

describe('bundled programs', () => {
  const hubManifest = join(repositoryRoot, 'apps', 'hub', 'package.json');
  const manifest = HUB_MANIFEST.parse(JSON.parse(readFileSync(hubManifest, 'utf8')));

  it.each(BUNDLED_PACKAGES)('ships $packageName and finds its binary on disk', (bundled) => {
    expect(PROGRAMS[bundled.resolver]?.kind).toBe('bundled');
    expect(manifest.dependencies[bundled.packageName]).toMatch(/^\d/u);
    expect(isShipped(bundled.packageName)).toBe(true);
    const binary = z.string().parse(createRequire(hubManifest)(bundled.packageName));
    expect(() => {
      accessSync(binary, constants.X_OK);
    }).not.toThrow();
  });

  it('names a package for every bundled resolver', () => {
    const resolvers = Object.entries(PROGRAMS)
      .filter(([, entry]) => entry.kind === 'bundled')
      .map(([program]) => program);
    expect(BUNDLED_PACKAGES.map((bundled) => bundled.resolver).sort()).toStrictEqual(
      resolvers.sort(),
    );
  });
});
