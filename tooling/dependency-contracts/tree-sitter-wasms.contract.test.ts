import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_TABLE } from 'dsh-plugin-codegraph-tree-sitter';

const resolve = createRequire(import.meta.url).resolve;

describe('tree-sitter-wasms contract', () => {
  it('ships a grammar binary for every language the code index extracts', () => {
    const missing = LANGUAGE_TABLE.map((spec) => spec.wasmFile).filter(
      (file) => !existsSync(resolve(`tree-sitter-wasms/out/${file}`)),
    );

    expect(LANGUAGE_TABLE.length).toBeGreaterThan(10);
    expect(missing).toStrictEqual([]);
  });
});
