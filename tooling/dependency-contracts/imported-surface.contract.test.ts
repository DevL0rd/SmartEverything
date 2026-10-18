import { describe, expect, it } from 'vitest';
import { loadTargets } from './coverage';

describe('packages without a dedicated contract', () => {
  it.each(loadTargets().map((target) => [target.specifier, target] as const))(
    '%s loads and exports every symbol the code imports from it',
    async (specifier, target) => {
      const loaded: unknown = await import(specifier);
      expect(loaded).toBeTypeOf('object');
      const exported = new Set(
        typeof loaded === 'object' && loaded !== null ? Object.keys(loaded) : [],
      );
      expect([...target.names].filter((name) => !exported.has(name))).toStrictEqual([]);
    },
  );
});
