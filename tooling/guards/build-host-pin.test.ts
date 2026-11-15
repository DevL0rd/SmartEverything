import type * as Fs from 'node:fs';
import { expect, it, vi } from 'vitest';

it('keeps the pin readable after the tooling folder is moved away', async () => {
  vi.resetModules();
  const reads: string[] = [];
  vi.doMock('node:fs', async (importOriginal) => {
    const actual: typeof Fs = await importOriginal();
    return {
      ...actual,
      readFileSync: (
        ...args: Parameters<typeof Fs.readFileSync>
      ): ReturnType<typeof Fs.readFileSync> => {
        if (args[0].toString().endsWith('build-host-pin.json')) {
          if (reads.length > 0) throw new Error('ENOENT: the folder was moved');
          reads.push(args[0].toString());
        }
        return actual.readFileSync(...args);
      },
    };
  });
  const { readBuildHostPin } = await import('../build-host-pin.ts');
  expect(readBuildHostPin().jdkMajor).toBeGreaterThan(0);
  expect(readBuildHostPin().go.version).toMatch(/^\d+\.\d+\.\d+$/u);
  expect(reads).toHaveLength(1);
  vi.doUnmock('node:fs');
  vi.resetModules();
});
