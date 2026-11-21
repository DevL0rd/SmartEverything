import { beforeAll, describe, expect, it } from 'vitest';
import { declaredPackageNames, workspaceManifestPaths } from './contract-helpers';
import { applicationWithoutContract, loadTargets } from './coverage';

const SOURCE_SCAN_TIMEOUT_MS = 60_000;

describe('dependency manifests', () => {
  let targets: readonly string[] = [];

  beforeAll(() => {
    targets = loadTargets().map((target) => target.specifier);
  }, SOURCE_SCAN_TIMEOUT_MS);

  it('lists the root, every application, package and tool', () => {
    expect(workspaceManifestPaths()).toStrictEqual(
      expect.arrayContaining([
        'package.json',
        'apps/app/package.json',
        'apps/hub/package.json',
        'packages/harness/package.json',
        'tooling/guards/package.json',
      ]),
    );
  });

  it('has a contract test for every application dependency the Expo SDK does not manage', () => {
    expect(applicationWithoutContract()).toStrictEqual([]);
  });

  it('loads every other external dependency, the ones without a dedicated contract test included', () => {
    expect(targets).toContain('@deepseek-ai/dsh-fs');
    expect(targets).toContain('mqtt');
  });

  it('needs no contract test for a package of our own, which has its own suite', () => {
    expect(declaredPackageNames('package.json')).toContain('@smarteverything/logging');
    expect(targets).not.toContain('@smarteverything/logging');
  });
});
