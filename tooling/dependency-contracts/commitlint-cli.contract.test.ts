import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { itIsPinnedToItsDeclaredVersion } from './contract-helpers';
import { repositoryFile } from './versions';

const CONFIG_MODULE = z.object({
  default: z.object({
    extends: z.array(z.string()),
    rules: z.record(z.string(), z.unknown()),
  }),
});

describe('@commitlint/cli contract', () => {
  itIsPinnedToItsDeclaredVersion('@commitlint/cli');

  it('has a configuration file the pipeline can load', () => {
    expect(existsSync(repositoryFile('commitlint.config.js'))).toBe(true);
  });

  it('is configured to extend the conventional ruleset', async () => {
    const loaded: unknown = await import(repositoryFile('commitlint.config.js'));
    const config = CONFIG_MODULE.parse(loaded);
    expect(config.default.extends).toContain('@commitlint/config-conventional');
  });
});
