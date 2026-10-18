import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HARNESS_CODEGRAPH_VERSION } from '../src/composition/builtins';

const PACKAGE = z.object({ version: z.string() });
const resolve = createRequire(import.meta.url);

describe('code index built-in version', () => {
  it.each([
    'dsh-plugin-codegraph-service',
    'dsh-plugin-codegraph-sqlite',
    'dsh-plugin-codegraph-tool',
    'dsh-plugin-codegraph-tree-sitter',
  ])('is the release of %s that is installed', (name) => {
    expect(PACKAGE.parse(resolve(`${name}/package.json`)).version).toBe(HARNESS_CODEGRAPH_VERSION);
  });
});
