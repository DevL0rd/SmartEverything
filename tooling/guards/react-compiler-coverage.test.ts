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
  readonly fnLoc?: { readonly start?: { readonly line?: number } } | null;
  readonly detail?: {
    readonly reason?: string;
    readonly options?: { readonly reason?: string };
  };
}

interface Babel {
  readonly transformSync: (code: string, options: Record<string, unknown>) => unknown;
}

function babelOf(loaded: unknown): Babel {
  if (
    typeof loaded !== 'object' ||
    loaded === null ||
    !('transformSync' in loaded) ||
    typeof loaded.transformSync !== 'function'
  ) {
    throw new Error('@babel/core has no transformSync');
  }
  const transformSync = loaded.transformSync;
  return {
    transformSync: (code, options): unknown =>
      Reflect.apply(transformSync, loaded, [code, options]),
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
  .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'));

function functionNameAt(text: string, line: number | undefined): string {
  const declared = line === undefined ? undefined : text.split('\n')[line - 1];
  const name = declared?.match(/function\s+(\w+)|(?:const|let)\s+(\w+)\s*=/u);
  const found = name?.[1] ?? name?.[2];
  if (found === undefined) throw new Error(`no function name at line ${String(line)}`);
  return found;
}

function bailoutsOf(file: string): readonly { readonly key: string; readonly reason: string }[] {
  const text = readFileSync(file, 'utf8');
  const events: CompilerEvent[] = [];
  babel.transformSync(text, {
    filename: file,
    babelrc: false,
    configFile: false,
    code: false,
    presets: [[typescriptPreset, { isTSX: true, allExtensions: true }]],
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
  return events
    .filter((event) => event.kind === 'CompileError' || event.kind === 'PipelineError')
    .map((event) => ({
      key: `${insideApp(file)} ${functionNameAt(text, event.fnLoc?.start?.line)}`,
      reason: event.detail?.options?.reason ?? event.detail?.reason ?? event.kind,
    }));
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
