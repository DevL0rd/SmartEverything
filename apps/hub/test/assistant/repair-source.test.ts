import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { repairSourceDigest, sealRepairSource } from '../../src/assistant/repair-source';

afterEach(() => {
  vi.unstubAllEnvs();
});

it('seals committed source bytes even if the checkout changes and refuses links', async () => {
  const root = mkdtempSync(join(tmpdir(), 'repair-source-'));
  const path = 'apps/hub/src/example.ts';
  const link = 'apps/hub/src/alias.ts';
  const source = 'export const example = 1;\n';
  const git = (...args: readonly string[]): string =>
    execFileSync('git', [...args], { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '--quiet');
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
    symlinkSync('example.ts', join(root, link));
    git('add', '--', path, link);
    const revision = git(
      '-c',
      'user.name=Repair Fixture',
      '-c',
      'user.email=repair@example.invalid',
      'commit-tree',
      git('write-tree'),
      '-m',
      'Repair source fixture',
    );
    writeFileSync(join(root, path), 'export const example = 2;\n');
    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ROOT', root);
    const input = { requestId: randomUUID(), revision } as const;

    await expect(sealRepairSource({ ...input, paths: [path] })).resolves.toEqual({
      revision,
      sources: [{ path, text: source, digest: repairSourceDigest(source) }],
    });
    await expect(sealRepairSource({ ...input, paths: [link] })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  } finally {
    rmSync(root, { recursive: true });
  }
});
