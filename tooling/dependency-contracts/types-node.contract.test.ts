import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROOT_MANIFEST, declaredVersion } from './contract-helpers';

describe('@types/node contract', () => {
  it('types the node builtins the tooling imports', () => {
    expect(typeof readFileSync).toBe('function');
  });

  it('tracks the major version of the running node runtime', () => {
    const typesMajor = Number(declaredVersion(ROOT_MANIFEST, '@types/node').split('.')[0]);
    const runtimeMajor = Number(process.versions.node.split('.')[0]);
    expect(typesMajor).toBe(runtimeMajor);
  });
});
