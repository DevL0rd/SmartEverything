import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unpinnedDependencies, workspaceManifests } from '../pinned-versions.ts';
import { repositoryRoot } from './repository-files';

describe('pinned dependency versions', () => {
  it('finds the root manifest and every workspace manifest', () => {
    const manifests = workspaceManifests(repositoryRoot);
    expect(manifests[0]).toBe('package.json');
    expect(manifests).toEqual(
      expect.arrayContaining([
        'apps/app/package.json',
        'apps/hub/package.json',
        'packages/domain/package.json',
        'tooling/guards/package.json',
      ]),
    );
  });

  it('accepts exact versions, prereleases, workspace links, and exact npm aliases', () => {
    expect(
      unpinnedDependencies('packages/a/package.json', {
        dependencies: { a: '1.2.3', b: '0.2.1-alpha.2', c: '1.0.0+build.5', d: 'workspace:*' },
        devDependencies: { e: 'npm:left-pad@1.3.0', f: 'npm:@scope/left-pad@1.3.0-rc.1' },
        optionalDependencies: { g: '4.5.6' },
      }),
    ).toStrictEqual([]);
  });

  it('accepts a manifest that declares no dependencies', () => {
    expect(unpinnedDependencies('packages/a/package.json', { name: 'a' })).toStrictEqual([]);
  });

  it('names every range planted in a workspace manifest', () => {
    const planted = {
      dependencies: { caret: '^1.2.3', tilde: '~1.2.3', star: '*', latest: 'latest', open: '1.x' },
      devDependencies: {
        greater: '>=1.0.0',
        either: '1.0.0 || 2.0.0',
        loose: '1.2',
        link: 'workspace:^',
        vendored: 'file:vendor/e',
      },
      optionalDependencies: { tagged: 'next', alias: 'npm:left-pad@^1.3.0' },
    };
    expect(unpinnedDependencies('packages/a/package.json', planted)).toStrictEqual([
      'packages/a/package.json dependencies.caret@^1.2.3',
      'packages/a/package.json dependencies.tilde@~1.2.3',
      'packages/a/package.json dependencies.star@*',
      'packages/a/package.json dependencies.latest@latest',
      'packages/a/package.json dependencies.open@1.x',
      'packages/a/package.json devDependencies.greater@>=1.0.0',
      'packages/a/package.json devDependencies.either@1.0.0 || 2.0.0',
      'packages/a/package.json devDependencies.loose@1.2',
      'packages/a/package.json devDependencies.link@workspace:^',
      'packages/a/package.json devDependencies.vendored@file:vendor/e',
      'packages/a/package.json optionalDependencies.tagged@next',
      'packages/a/package.json optionalDependencies.alias@npm:left-pad@^1.3.0',
    ]);
  });

  it('holds every manifest in the repository to exact versions', () => {
    const ranged = workspaceManifests(repositoryRoot).flatMap((path) => {
      const manifest: unknown = JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8'));
      return unpinnedDependencies(path, manifest);
    });
    expect(ranged).toStrictEqual([]);
  });
});
