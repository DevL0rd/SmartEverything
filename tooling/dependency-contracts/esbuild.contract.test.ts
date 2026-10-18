import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, type BuildResult } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let scratch = '';

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'esbuild-contract-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function bundled(
  source: string,
  external: readonly string[],
): Promise<BuildResult<{ metafile: true; write: false }>> {
  const entry = join(scratch, 'entry.ts');
  writeFileSync(entry, source);
  return build({
    entryPoints: [entry],
    outfile: join(scratch, 'out.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: [...external],
    banner: { js: 'const banner = 1;' },
    metafile: true,
    write: false,
    logLevel: 'silent',
  });
}

describe('esbuild contract', () => {
  it('keeps imports matching a wildcard external out of the bundle and lists them in the metafile with their kind', async () => {
    const result = await bundled(
      "import { a } from '@scope/one';\nexport const b = () => require('@scope/two/sub');\nexport { a };",
      ['@scope/*'],
    );
    const imports = Object.values(result.metafile.outputs)[0]?.imports ?? [];

    expect(imports.filter((item) => item.external === true)).toEqual([
      { path: '@scope/one', kind: 'import-statement', external: true },
      { path: '@scope/two/sub', kind: 'require-call', external: true },
    ]);
  });

  it('lists node built-ins as external imports too, so they can be told apart from packages to ship', async () => {
    const result = await bundled(
      "import { readFileSync } from 'node:fs';\nexport { readFileSync };",
      ['jose'],
    );
    const imports = Object.values(result.metafile.outputs)[0]?.imports ?? [];

    expect(imports.map((item) => item.path)).toEqual(['node:fs']);
  });

  it('emits the banner first and leaves a function name that is called with a string literal as written', async () => {
    const result = await bundled(
      "const createLazyRequire = (name: string) => name;\nexport const load = createLazyRequire('lazy-pkg');",
      [],
    );
    const text = result.outputFiles[0]?.text ?? '';

    expect(text.startsWith('const banner = 1;')).toBe(true);
    expect(text).toContain('createLazyRequire("lazy-pkg")');
  });
});
