import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { desktopWebRuntime } from '../packaging/web-runtime.js';

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let fixture = '';

async function writeFixture(electron: string, preload: string): Promise<void> {
  await mkdir(path.join(fixture, 'src'), { recursive: true });
  await writeFile(
    path.join(fixture, 'package.json'),
    JSON.stringify({ devDependencies: { electron } }),
  );
  await writeFile(path.join(fixture, 'src', 'preload.ts'), preload);
  await writeFile(path.join(fixture, 'src', 'helper.ts'), 'export const helper = 1;\n');
  await writeFile(path.join(fixture, 'src', 'ipc.ts'), 'export const ipc = 1;\n');
  await writeFile(path.join(fixture, 'src', 'csp.ts'), 'export const csp = 1;\n');
}

const PRELOAD = "import { helper } from './helper';\nexport const bridge = helper;\n";

beforeEach(async () => {
  fixture = await mkdtemp(path.join(tmpdir(), 'web-runtime-'));
  await writeFixture('44.7.0', PRELOAD);
});

afterEach(async () => {
  await rm(fixture, { recursive: true, force: true });
});

describe('desktopWebRuntime', () => {
  it('is 32 hex characters and the same on every call', async () => {
    const first = await desktopWebRuntime(fixture);
    expect(first).toMatch(/^[0-9a-f]{32}$/u);
    expect(await desktopWebRuntime(fixture)).toBe(first);
  });

  it('is the same for an identical copy of the sources in another folder', async () => {
    const copy = await mkdtemp(path.join(tmpdir(), 'web-runtime-copy-'));
    try {
      const original = fixture;
      fixture = copy;
      await writeFixture('44.7.0', PRELOAD);
      fixture = original;
      expect(await desktopWebRuntime(copy)).toBe(await desktopWebRuntime(fixture));
    } finally {
      await rm(copy, { recursive: true, force: true });
    }
  });

  it('changes when the preload source changes', async () => {
    const before = await desktopWebRuntime(fixture);
    await writeFile(path.join(fixture, 'src', 'helper.ts'), 'export const helper = 2;\n');
    expect(await desktopWebRuntime(fixture)).not.toBe(before);
  });

  it('changes when the Electron version changes', async () => {
    const before = await desktopWebRuntime(fixture);
    await writeFixture('44.8.0', PRELOAD);
    expect(await desktopWebRuntime(fixture)).not.toBe(before);
  });

  it('changes when the ipc or csp source changes', async () => {
    const before = await desktopWebRuntime(fixture);
    await writeFile(path.join(fixture, 'src', 'ipc.ts'), 'export const ipc = 2;\n');
    const afterIpc = await desktopWebRuntime(fixture);
    expect(afterIpc).not.toBe(before);
    await writeFile(path.join(fixture, 'src', 'csp.ts'), 'export const csp = 2;\n');
    expect(await desktopWebRuntime(fixture)).not.toBe(afterIpc);
  });

  it('does not let bytes move between the ipc and csp parts', async () => {
    await writeFile(path.join(fixture, 'src', 'ipc.ts'), 'ab');
    await writeFile(path.join(fixture, 'src', 'csp.ts'), 'c');
    const first = await desktopWebRuntime(fixture);
    await writeFile(path.join(fixture, 'src', 'ipc.ts'), 'a');
    await writeFile(path.join(fixture, 'src', 'csp.ts'), 'bc');
    expect(await desktopWebRuntime(fixture)).not.toBe(first);
  });

  it('builds the real preload bridge deterministically', async () => {
    const first = await desktopWebRuntime(desktopDirectory);
    expect(first).toMatch(/^[0-9a-f]{32}$/u);
    expect(await desktopWebRuntime(desktopDirectory)).toBe(first);
  });
});
