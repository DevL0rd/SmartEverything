import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPackage, extractFile, uncache } from '@electron/asar';
import { expect, it } from 'vitest';

it('reads the root package manifest as bytes from an Electron ASAR', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'electron-asar-contract-'));
  const app = join(scratch, 'app');
  const archive = join(scratch, 'app.asar');
  const manifest = JSON.stringify({ name: 'fixture', version: '1.2.3' });
  try {
    await mkdir(app);
    await writeFile(join(app, 'package.json'), manifest);
    await createPackage(app, archive);
    expect(extractFile(archive, 'package.json', false).toString('utf8')).toBe(manifest);
  } finally {
    uncache(archive);
    await rm(scratch, { recursive: true, force: true });
  }
});
