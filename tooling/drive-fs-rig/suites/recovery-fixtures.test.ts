import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allocatedBytes, countFiles } from './recovery-probe.ts';
import { buildBatch, buildBig, smallFileSize } from './recovery-fixtures.ts';

describe('fixtures', () => {
  it('builds the same large file every time and reuses a recorded one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'recovery-fixture-'));
    try {
      const first = await buildBig(root, 3 << 20);
      expect(first.bytes).toBe(3 << 20);
      expect(first.files).toBe(1);
      const again = await buildBig(root, 3 << 20);
      expect(again.entries).toEqual(first.entries);
      const other = await mkdtemp(join(tmpdir(), 'recovery-fixture-'));
      try {
        const rebuilt = await buildBig(other, 3 << 20);
        expect(rebuilt.entries[0]?.sha256).toBe(first.entries[0]?.sha256);
      } finally {
        await rm(other, { recursive: true, force: true });
      }
      const resized = await buildBig(root, 1 << 20);
      expect(resized.bytes).toBe(1 << 20);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('builds small files of different sizes in folders of 100', async () => {
    const root = await mkdtemp(join(tmpdir(), 'recovery-fixture-'));
    try {
      const batch = await buildBatch(root, 250);
      expect(batch.files).toBe(250);
      expect(batch.entries.filter((entry) => entry.type === 'dir')).toHaveLength(3);
      expect(new Set(batch.entries.map((entry) => entry.size)).size).toBeGreaterThan(50);
      const text = await readFile(join(batch.directory, 'd2', 'f249.bin'));
      expect(text.length).toBe(smallFileSize(249));
      expect(await countFiles(batch.directory)).toBe(250);
      expect(await allocatedBytes(batch.directory)).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps every small file between one byte and eight KiB', () => {
    for (let index = 0; index < 5000; index += 1) {
      expect(smallFileSize(index)).toBeGreaterThanOrEqual(1);
      expect(smallFileSize(index)).toBeLessThanOrEqual(8192);
    }
  });

  it('counts nothing in a folder that does not exist', async () => {
    expect(await countFiles(join(tmpdir(), 'recovery-fixture-missing'))).toBe(0);
    expect(await allocatedBytes(join(tmpdir(), 'recovery-fixture-missing'))).toBe(0);
  });
});
