import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { itIsPinnedToItsDeclaredVersion, readRepositoryJson } from './contract-helpers';

const MANIFEST = z.object({ scripts: z.record(z.string(), z.string()) });

describe('markdown-link-check contract', () => {
  itIsPinnedToItsDeclaredVersion('markdown-link-check');

  it('checks every category of document, so a new folder cannot go unchecked', () => {
    const script = readRepositoryJson('package.json', MANIFEST).scripts['check:links'];
    const categories = readdirSync('docs', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(categories.length).toBeGreaterThan(0);
    expect(script).toContain('README.md');
    for (const category of categories) {
      expect(script).toContain(`docs/${category}/*.md`);
    }
  });

  it('leaves no document loose in docs, outside a category', () => {
    const loose = readdirSync('docs', { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name);

    expect(loose).toEqual([]);
  });
});
