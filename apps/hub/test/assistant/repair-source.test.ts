import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { hubLayout } from '../../src/data-layout';
import { repairSourceDigest, sealRepairSource } from '../../src/assistant/repair-source';

function layoutWith(data: string, updateSource: unknown): ReturnType<typeof hubLayout> {
  const layout = hubLayout(data, {});
  mkdirSync(dirname(layout.system.config.service), { recursive: true });
  writeFileSync(
    layout.system.config.service,
    JSON.stringify({ go2rtcBinary: '/opt/go2rtc', updateSource }),
  );
  return layout;
}

it('refuses to seal source when the hub has no update source', async () => {
  const data = mkdtempSync(join(tmpdir(), 'repair-source-data-'));
  try {
    const layout = layoutWith(data, undefined);
    await expect(
      sealRepairSource(layout, { requestId: randomUUID(), revision: 'a'.repeat(40), paths: [] }),
    ).rejects.toMatchObject({ code: 'conflict' });
  } finally {
    rmSync(data, { recursive: true });
  }
});

it('seals committed source bytes even if the checkout changes and refuses links', async () => {
  const root = mkdtempSync(join(tmpdir(), 'repair-source-'));
  const data = mkdtempSync(join(tmpdir(), 'repair-source-data-'));
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
    const layout = layoutWith(data, { checkout: root, remote: 'origin', branch: 'main' });
    const input = { requestId: randomUUID(), revision } as const;

    await expect(sealRepairSource(layout, { ...input, paths: [path] })).resolves.toEqual({
      revision,
      sources: [{ path, text: source, digest: repairSourceDigest(source) }],
    });
    await expect(sealRepairSource(layout, { ...input, paths: [link] })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  } finally {
    rmSync(root, { recursive: true });
    rmSync(data, { recursive: true });
  }
});
