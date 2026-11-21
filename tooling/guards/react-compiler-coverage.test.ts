import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applicationRoutes,
  applicationSource,
  filesUnder,
  insideApp,
  repositoryRoot,
} from './repository-files';

interface CompilerEvent {
  readonly kind: string;
  readonly fnLoc?: {
    readonly start?: { readonly line?: number; readonly column?: number };
  } | null;
  readonly detail?: {
    readonly reason?: string;
    readonly options?: { readonly reason?: string };
  };
}

interface Babel {
  readonly transformSync: (code: string, options: Record<string, unknown>) => unknown;
  readonly parseSync: (code: string, options: Record<string, unknown>) => unknown;
}

interface SyntaxNode {
  readonly type: string;
  readonly loc?: { readonly start: { readonly line: number; readonly column: number } };
  readonly [key: string]: unknown;
}

const HOOK = /^use[A-Z0-9]/u;
const FUNCTION = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);

function babelOf(loaded: unknown): Babel {
  if (
    typeof loaded !== 'object' ||
    loaded === null ||
    !('transformSync' in loaded) ||
    typeof loaded.transformSync !== 'function' ||
    !('parseSync' in loaded) ||
    typeof loaded.parseSync !== 'function'
  ) {
    throw new Error('@babel/core has no transformSync or parseSync');
  }
  const transformSync = loaded.transformSync;
  const parseSync = loaded.parseSync;
  return {
    transformSync: (code, options): unknown =>
      Reflect.apply(transformSync, loaded, [code, options]),
    parseSync: (code, options): unknown => Reflect.apply(parseSync, loaded, [code, options]),
  };
}

const appRequire = createRequire(join(repositoryRoot, 'apps', 'app', 'package.json'));
const expoRequire = createRequire(appRequire.resolve('babel-preset-expo'));
const babel = babelOf(appRequire('@babel/core'));
const typescriptPreset = expoRequire.resolve('@babel/preset-typescript');
const compilerPlugin = appRequire.resolve('babel-plugin-react-compiler');

const ALLOWED: Readonly<Record<string, string>> = {
  'src/store/store-context.tsx useStoreSelector':
    'the subscription reads its slice set lazily from a ref on every store change, by design',
};

const applicationPlugins = join(repositoryRoot, 'apps', 'app', 'plugins');

const sources = [applicationSource, applicationRoutes, applicationPlugins]
  .flatMap((root) => filesUnder(root))
  .filter(
    (file) => (file.endsWith('.tsx') || file.endsWith('.ts')) && !/\.test\.tsx?$/u.test(file),
  );

function functionNameAt(text: string, line: number | undefined): string {
  const declared = line === undefined ? undefined : text.split('\n')[line - 1];
  const name = declared?.match(/function\s+(\w+)|(?:const|let)\s+(\w+)\s*=/u);
  const found = name?.[1] ?? name?.[2];
  if (found === undefined) throw new Error(`no function name at line ${String(line)}`);
  return found;
}

function isNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

function nodesIn(value: unknown): readonly SyntaxNode[] {
  if (!Array.isArray(value)) return [];
  const items: readonly unknown[] = value;
  return items.filter(isNode);
}

function identifierName(value: unknown): string | null {
  if (!isNode(value) || value.type !== 'Identifier') return null;
  const name = value['name'];
  return typeof name === 'string' ? name : null;
}

function calleeName(callee: unknown): string | null {
  if (!isNode(callee)) return null;
  if (callee.type === 'MemberExpression' && callee['computed'] === false) {
    return identifierName(callee['property']);
  }
  return identifierName(callee);
}

function optedOut(fn: SyntaxNode): boolean {
  const body = fn['body'];
  if (!isNode(body)) return false;
  return nodesIn(body['directives']).some((directive) => {
    const value = directive['value'];
    return isNode(value) && value['value'] === 'use no memo';
  });
}

function isHookCall(node: SyntaxNode): boolean {
  if (node.type !== 'CallExpression') return false;
  const name = calleeName(node['callee']);
  return name !== null && (name === 'use' || HOOK.test(name));
}

function childrenOf(node: SyntaxNode): readonly SyntaxNode[] {
  return Object.entries(node).flatMap(([key, child]) =>
    key === 'loc' ? [] : isNode(child) ? [child] : nodesIn(child),
  );
}

function callsHook(fn: SyntaxNode): boolean {
  const body = fn['body'];
  const stack: SyntaxNode[] = isNode(body) ? [body] : [];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || FUNCTION.has(next.type)) continue;
    if (isHookCall(next)) return true;
    stack.push(...childrenOf(next));
  }
  return false;
}

interface NamedFunction {
  readonly name: string;
  readonly fn: SyntaxNode;
}

function declarationOf(statement: SyntaxNode): SyntaxNode {
  const declared = statement['declaration'];
  const exported =
    statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration';
  return exported && isNode(declared) ? declared : statement;
}

function functionsOf(declaration: SyntaxNode): readonly NamedFunction[] {
  if (declaration.type === 'FunctionDeclaration') {
    const name = identifierName(declaration['id']);
    return name === null ? [] : [{ name, fn: declaration }];
  }
  if (declaration.type !== 'VariableDeclaration') return [];
  return nodesIn(declaration['declarations']).flatMap((declarator) => {
    const name = identifierName(declarator['id']);
    const init = declarator['init'];
    return name !== null && isNode(init) && FUNCTION.has(init.type) ? [{ name, fn: init }] : [];
  });
}

function topLevelHooks(program: SyntaxNode): readonly NamedFunction[] {
  return nodesIn(program['body'])
    .flatMap((statement) => functionsOf(declarationOf(statement)))
    .filter((hook) => HOOK.test(hook.name) && !optedOut(hook.fn) && callsHook(hook.fn));
}

function programOf(parsed: unknown): SyntaxNode {
  if (!isNode(parsed) || parsed.type !== 'File' || !isNode(parsed['program'])) {
    throw new Error('@babel/core parseSync returned no program');
  }
  return parsed['program'];
}

function locationOf(
  start: { readonly line?: number; readonly column?: number } | undefined,
): string {
  return `${String(start?.line)}:${String(start?.column)}`;
}

function bailoutsOf(file: string): readonly { readonly key: string; readonly reason: string }[] {
  const text = readFileSync(file, 'utf8');
  const events: CompilerEvent[] = [];
  const presets = [[typescriptPreset, { isTSX: file.endsWith('.tsx'), allExtensions: true }]];
  const program = programOf(
    babel.parseSync(text, { filename: file, babelrc: false, configFile: false, presets }),
  );
  babel.transformSync(text, {
    filename: file,
    babelrc: false,
    configFile: false,
    code: false,
    presets,
    plugins: [
      [
        compilerPlugin,
        {
          target: '19',
          logger: {
            logEvent: (_name: string, event: CompilerEvent): void => {
              events.push(event);
            },
          },
        },
      ],
    ],
  });
  const failed = events.filter(
    (event) => event.kind === 'CompileError' || event.kind === 'PipelineError',
  );
  const reported = new Set(
    events
      .filter(
        (event) =>
          event.kind === 'CompileSuccess' || event.kind === 'CompileSkip' || failed.includes(event),
      )
      .map((event) => locationOf(event.fnLoc?.start)),
  );
  const skipped = topLevelHooks(program)
    .filter((hook) => !reported.has(locationOf(hook.fn.loc?.start)))
    .map((hook) => ({
      key: `${insideApp(file)} ${hook.name}`,
      reason:
        'a hook that calls a hook was never compiled; React Compiler does not count use() as a hook, so read the context with useContext',
    }));
  return [
    ...failed.map((event) => ({
      key: `${insideApp(file)} ${functionNameAt(text, event.fnLoc?.start?.line)}`,
      reason: event.detail?.options?.reason ?? event.detail?.reason ?? event.kind,
    })),
    ...skipped,
  ];
}

describe('React Compiler coverage', () => {
  let found: readonly { readonly key: string; readonly reason: string }[] = [];

  beforeAll(() => {
    found = sources.flatMap(bailoutsOf);
  }, 600_000);

  it('compiles every component and hook outside the reasoned allow list', () => {
    expect(
      found
        .filter((bailout) => ALLOWED[bailout.key] === undefined)
        .map((bailout) => `${bailout.key}: ${bailout.reason}`),
    ).toEqual([]);
  });

  it('keeps no allowance for a function that compiles now', () => {
    const failing = new Set(found.map((bailout) => bailout.key));
    expect(Object.keys(ALLOWED).filter((key) => !failing.has(key))).toEqual([]);
  });
});
