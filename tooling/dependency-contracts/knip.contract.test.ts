import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { itIsPinnedToItsDeclaredVersion, readRepositoryJson } from './contract-helpers';

const KNIP_CONFIG = z.object({
  workspaces: z.record(z.string(), z.object({ entry: z.array(z.string()) }).loose()),
});

describe('knip contract', () => {
  itIsPinnedToItsDeclaredVersion('knip');

  it('is configured to inspect every workspace that holds source', () => {
    const config = readRepositoryJson('knip.json', KNIP_CONFIG);
    expect(Object.keys(config.workspaces)).toContain('packages/logging');
    expect(Object.keys(config.workspaces)).toContain('tooling/dependency-contracts');
    expect(Object.keys(config.workspaces)).toContain('tooling/guards');
    expect(Object.keys(config.workspaces)).toContain('apps/app');
  });
});
