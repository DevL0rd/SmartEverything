import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readRepositoryJson } from './contract-helpers';
import { repositoryFile } from './versions';

const MANIFEST = z.object({ scripts: z.record(z.string(), z.string()) });

function linkCheckScript(): string {
  return readRepositoryJson('package.json', MANIFEST).scripts['check:links'] ?? '';
}

function documents(): readonly string[] {
  return readdirSync(repositoryFile('docs'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);
}

function folders(): readonly string[] {
  return readdirSync(repositoryFile('docs'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

describe('markdown-link-check contract', () => {
  it('checks the readme and every document in docs, so a new document cannot go unchecked', () => {
    expect(documents().length).toBeGreaterThan(0);
    expect(linkCheckScript()).toContain('README.md');
    for (const document of documents()) {
      expect(linkCheckScript()).toContain(`docs/${document}`);
    }
  });

  it('checks every folder of documents in docs, so a new folder cannot go unchecked', () => {
    for (const folder of folders()) {
      expect(linkCheckScript()).toContain(`docs/${folder}/*.md`);
    }
  });
});
