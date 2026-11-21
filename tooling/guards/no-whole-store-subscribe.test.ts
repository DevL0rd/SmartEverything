import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint, type Rule } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const root = join(import.meta.dirname, '..', '..');
const plugin = z.object({
  default: z.object({ rules: z.record(z.string(), z.custom<Rule.RuleModule>()) }),
});
const RULE = 'local/no-whole-store-subscribe';
const STORE = `class EntityStore {
  readonly subscribe = (listener: () => void): (() => void) => () => listener;
  readonly subscribeSlices = (reads: readonly string[], listener: () => void): (() => void) => () => reads.length + Number(listener);
}
class Other {
  subscribe(listener: () => void): () => void { return () => listener; }
}
declare const store: EntityStore;
declare const maybe: EntityStore | null;
declare const other: Other;
declare function useDevices(): readonly unknown[];
`;

let eslint: ESLint;

beforeAll(async () => {
  const loaded = plugin.parse(
    await import(pathToFileURL(join(root, 'tooling/eslint/rules.js')).href),
  );
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            projectService: { allowDefaultProject: ['sample.ts', 'allowed.ts', 'banned.ts'] },
            tsconfigRootDir: root,
          },
        },
        plugins: { local: loaded.default },
        rules: { [RULE]: ['error', { allow: ['allowed.ts'], deviceListIn: ['banned.ts'] }] },
      },
    ],
  });
});

async function flagged(source: string, filePath = 'sample.ts'): Promise<number> {
  const [result] = await eslint.lintText(STORE + source, { filePath });
  return (result?.messages ?? []).filter((message) => message.ruleId === RULE).length;
}

describe('no-whole-store-subscribe', () => {
  it('flags a whole-store subscription on the entity store', async () => {
    expect(await flagged('store.subscribe(() => undefined);')).toBe(1);
    expect(await flagged('maybe?.subscribe(() => undefined);')).toBe(1);
  });

  it('allows slice subscriptions, other stores and allow-listed files', async () => {
    expect(await flagged("store.subscribeSlices(['tables.layouts'], () => undefined);")).toBe(0);
    expect(await flagged('other.subscribe(() => undefined);')).toBe(0);
    expect(await flagged('store.subscribe(() => undefined);', 'allowed.ts')).toBe(0);
  });

  it('flags useDevices() only inside the folders that ban the whole device list', async () => {
    expect(await flagged('useDevices();', 'banned.ts')).toBe(1);
    expect(await flagged('useDevices();')).toBe(0);
  });
});
