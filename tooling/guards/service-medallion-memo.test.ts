import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { repositoryRoot } from './repository-files';

const appRequire = createRequire(join(repositoryRoot, 'apps', 'app', 'package.json'));
const expoRequire = createRequire(appRequire.resolve('babel-preset-expo'));
const babel = z
  .object({ transformSync: z.custom<(code: string, options: object) => unknown>() })
  .parse(appRequire('@babel/core'));
const typescriptPreset = expoRequire.resolve('@babel/preset-typescript');
const compilerPlugin = appRequire.resolve('babel-plugin-react-compiler');

const EVENT = z.object({
  kind: z.string(),
  fnName: z.string().nullish(),
  prunedMemoBlocks: z.number().optional(),
});

const file = join(
  repositoryRoot,
  'apps',
  'app',
  'src',
  'plugins',
  'shared',
  'service-medallion.tsx',
);

function compile(): { readonly code: string; readonly pruned: ReadonlyMap<string, number> } {
  const pruned = new Map<string, number>();
  const result = z.object({ code: z.string() }).parse(
    babel.transformSync(readFileSync(file, 'utf8'), {
      filename: file,
      babelrc: false,
      configFile: false,
      presets: [[typescriptPreset, { isTSX: true, allExtensions: true }]],
      plugins: [
        [
          compilerPlugin,
          {
            target: '19',
            logger: {
              logEvent: (_: unknown, raw: unknown): void => {
                const event = EVENT.parse(raw);
                if (event.kind !== 'CompileSuccess' || event.fnName == null) return;
                pruned.set(event.fnName, event.prunedMemoBlocks ?? 0);
              },
            },
          },
        ],
      ],
    }),
  );
  return { code: result.code, pruned };
}

function guardOf(code: string, element: string): string {
  const at = code.indexOf(`<${element}`);
  expect(at).toBeGreaterThan(-1);
  const guard = code.lastIndexOf('if (', at);
  return code.slice(guard, code.indexOf('{', guard));
}

describe('ServiceMedallion memoisation', () => {
  const { code, pruned } = compile();

  it('compiles every part with no memo block dropped by a hook call', () => {
    expect(Object.fromEntries(pruned)).toEqual({ Disc: 0, StatusMark: 0, ServiceMedallion: 0 });
  });

  it('keeps the glow, disc and status mark apart from the spoken label that changes every tick', () => {
    for (const element of ['Glow', 'Disc', 'StatusMark']) {
      const guard = guardOf(code, element);
      expect(guard).not.toContain('label');
      expect(guard).toContain('$[');
    }
  });
});
