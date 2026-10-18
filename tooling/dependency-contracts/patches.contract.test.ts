import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { installedVersion, repositoryFile } from './versions';

interface Patch {
  readonly file: string;
  readonly packageName: string;
  readonly version: string;
}

interface Change {
  readonly path: string;
  readonly deleted: boolean;
  readonly added: readonly string[];
}

const PATCHED = z.looseObject({ patchedDependencies: z.record(z.string(), z.string()) });

const PATCH_NAME = /^(.+)@(\d[^@]*)\.patch$/u;

function registeredPatches(): readonly string[] {
  const workspace = PATCHED.parse(
    parse(readFileSync(repositoryFile('pnpm-workspace.yaml'), 'utf8')),
  );
  return Object.keys(workspace.patchedDependencies).sort();
}

function patches(): readonly Patch[] {
  return readdirSync(repositoryFile('patches')).flatMap((file) => {
    const [, name, version] = PATCH_NAME.exec(file) ?? [];
    return name === undefined || version === undefined
      ? []
      : [{ file, packageName: name.replace('__', '/'), version }];
  });
}

function changesIn(patch: Patch): readonly Change[] {
  const text = readFileSync(repositoryFile(`patches/${patch.file}`), 'utf8');
  return text
    .split(/^diff --git /mu)
    .slice(1)
    .map((block) => {
      const lines = block.split('\n');
      const path = /^a\/(\S+)/u.exec(lines[0] ?? '')?.[1] ?? '';
      return {
        path,
        deleted: lines.some((line) => line.startsWith('deleted file mode')),
        added: lines
          .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
          .map((line) => line.slice(1))
          .filter((line) => line.trim().length > 0),
      };
    });
}

function installedPath(patch: Patch, change: Change): string {
  return repositoryFile(`node_modules/${patch.packageName}/${change.path}`);
}

describe('pnpm patches', () => {
  it('has a patch file for every registered patch and no unregistered one', () => {
    expect(
      patches()
        .map((patch) => `${patch.packageName}@${patch.version}`)
        .sort(),
    ).toStrictEqual(registeredPatches());
  });

  describe.each(patches())('$file', (patch) => {
    it('targets the release that is installed', () => {
      expect(installedVersion(patch.packageName)).toBe(patch.version);
    });

    it('is applied: every added line is installed and every deleted file is gone', () => {
      const unapplied = changesIn(patch).flatMap((change) => {
        const target = installedPath(patch, change);
        if (change.deleted) return existsSync(target) ? [`${change.path} still exists`] : [];
        if (!existsSync(target)) return [`${change.path} is missing`];
        const installed = new Set(readFileSync(target, 'utf8').split('\n'));
        return change.added
          .filter((line) => !installed.has(line))
          .map((line) => `${change.path}: ${line.trim()}`);
      });

      expect(unapplied).toStrictEqual([]);
    });
  });
});
