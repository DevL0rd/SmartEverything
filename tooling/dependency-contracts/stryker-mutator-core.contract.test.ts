import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readRepositoryJson } from './contract-helpers';

const CONFIG_SCHEMA = z.object({
  thresholds: z.object({ break: z.number(), high: z.number(), low: z.number() }),
  mutate: z.array(z.string()),
});

describe('@stryker-mutator/core contract', () => {
  it('breaks the build below a perfect mutation score', () => {
    expect(readRepositoryJson('stryker.config.json', CONFIG_SCHEMA).thresholds.break).toBe(100);
  });

  it('mutates the logging source, which every runtime shares', () => {
    const config = readRepositoryJson('stryker.config.json', CONFIG_SCHEMA);
    expect(config.mutate.some((pattern) => pattern.includes('packages/logging/src'))).toBe(true);
  });
});
