import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readRepositoryJson } from './contract-helpers';

const MANIFEST = z.object({ scripts: z.record(z.string(), z.string()) });

describe('dpdm contract', () => {
  it('is wired to fail the build on a circular import', () => {
    const scripts = readRepositoryJson('package.json', MANIFEST).scripts;
    expect(scripts['check:cycles']).toContain('circular:1');
  });
});
