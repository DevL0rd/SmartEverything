import { describe, expect, it } from 'vitest';
import { itIsPinnedToItsDeclaredVersion } from './contract-helpers';
import { readFileSync } from 'node:fs';
import { declaredVersion } from './versions';

describe('@types/node contract', () => {
  itIsPinnedToItsDeclaredVersion('@types/node');

  it('types the node builtins the tooling imports', () => {
    expect(typeof readFileSync).toBe('function');
  });

  it('tracks the major version of the running node runtime', () => {
    const typesMajor = Number(declaredVersion('@types/node').split('.')[0]);
    const runtimeMajor = Number(process.versions.node.split('.')[0]);
    expect(typesMajor).toBe(runtimeMajor);
  });
});
