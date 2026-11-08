import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import { gitSourceText, type HubUpdateSource } from '../hub-update-source.ts';

export const REVIEWER_ID = '38711789-95ba-42ab-ac91-d82a24f62ba6';

interface HubSourceFixture {
  scratch: string;
  upstream: string;
  source: HubUpdateSource;
}

export const fixture: HubSourceFixture = {
  scratch: '',
  upstream: '',
  source: { folder: '', remote: 'origin', branch: 'main' },
};

export function git(folder: string, ...args: string[]): Promise<string> {
  return gitSourceText(folder, args, 'prepare the Git test fixture');
}

export async function commit(folder: string, note: string): Promise<void> {
  await git(folder, 'add', '-A');
  await git(
    folder,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    note,
  );
}

export function write(folder: string, name: string, content: string): void {
  writeFileSync(join(folder, name), content);
}

export function useHubSourceFixture(): void {
  beforeEach(async () => {
    fixture.scratch = mkdtempSync(join(tmpdir(), 'hub-update-source-'));
    fixture.upstream = join(fixture.scratch, 'upstream');
    const folder = join(fixture.scratch, 'source');
    await git(fixture.scratch, 'init', '-b', 'main', fixture.upstream);
    write(fixture.upstream, '.gitignore', 'private.env\n');
    write(fixture.upstream, 'shared.txt', 'original\n');
    write(fixture.upstream, 'local.txt', 'base\n');
    await commit(fixture.upstream, 'base');
    await git(fixture.scratch, 'clone', '--no-hardlinks', fixture.upstream, folder);
    fixture.source = { folder, remote: 'origin', branch: 'main' };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(fixture.scratch, { recursive: true, force: true });
  });
}
