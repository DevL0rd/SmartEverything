import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readRepositoryJson } from './contract-helpers';

const CONFIG = z.object({
  words: z.array(z.string()),
  ignorePaths: z.array(z.string()),
});

describe('cspell contract', () => {
  it('does not spell check generated output', () => {
    const config = readRepositoryJson('cspell.json', CONFIG);
    expect(config.ignorePaths).toContain('pnpm-lock.yaml');
    expect(config.ignorePaths).toContain('apps/*/dist/**');
  });

  it('knows the words this product invents', () => {
    const config = readRepositoryJson('cspell.json', CONFIG);
    expect(config.words).toContain('SmartEverything');
    expect(config.words).toContain('Uniwind');
  });
});
