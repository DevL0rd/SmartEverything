import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readRepositoryJson } from './contract-helpers';

const CONFIG_SCHEMA = z.object({
  threshold: z.number(),
  minLines: z.number(),
  minTokens: z.number(),
  path: z.array(z.string()),
});

describe('jscpd contract', () => {
  it('is configured to allow no duplication at all', () => {
    expect(readRepositoryJson('.jscpd.json', CONFIG_SCHEMA).threshold).toBe(0);
  });

  it('scans every source directory that holds logic', () => {
    const config = readRepositoryJson('.jscpd.json', CONFIG_SCHEMA);
    expect(config.path).toContain('apps');
    expect(config.path).toContain('packages');
    expect(config.path).toContain('tooling');
  });
});
