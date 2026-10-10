import { describe, expect, it } from 'vitest';
import { itIsPinnedToItsDeclaredVersion, readRepositoryJson } from './contract-helpers';
import { z } from 'zod';

const MANIFEST = z.object({ scripts: z.record(z.string(), z.string()) });

describe('dpdm contract', () => {
  itIsPinnedToItsDeclaredVersion('dpdm');

  it('is wired to fail the build on a circular import', () => {
    const scripts = readRepositoryJson('package.json', MANIFEST).scripts;
    expect(scripts['check:cycles']).toContain('circular:1');
  });
});
