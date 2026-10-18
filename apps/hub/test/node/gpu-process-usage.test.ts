import type * as Fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GpuProcessUsage } from '../../src/node/controls/linux/gpu-processes';

const gpuClients = vi.hoisted(() => new Map<number, number>());

vi.mock('../../src/node/collectors/linux/gpu-nvidia', () => ({
  hasNvidiaDriver: (): boolean => false,
}));

function procPid(path: string): number {
  return Number(path.split('/')[2]);
}

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return {
    ...actual,
    readdirSync: (path: string, ...rest: never[]): string[] =>
      path.endsWith('/fd')
        ? gpuClients.has(procPid(path))
          ? ['3']
          : actual.readdirSync(`/proc/self/nonexistent-${path}`)
        : actual.readdirSync(path, ...rest),
    readlinkSync: (path: string, ...rest: never[]): string =>
      path.startsWith('/proc/') && path.endsWith('/fd/3')
        ? '/dev/dri/renderD128'
        : actual.readlinkSync(path, ...rest),
    readFileSync: (path: string, ...rest: never[]): string | Buffer =>
      path.startsWith('/proc/') && path.endsWith('/fdinfo/3')
        ? `drm-client-id:\t7\ndrm-engine-gfx:\t${String(gpuClients.get(procPid(path)) ?? 0)} ns\n`
        : actual.readFileSync(path, ...rest),
  };
});

describe('GpuProcessUsage', () => {
  it('reports the share of a program that uses the gpu and forgets it once the program is gone', () => {
    const usage = new GpuProcessUsage();
    usage.setActive(true);
    gpuClients.set(10, 0);
    usage.sample([10], 0);
    gpuClients.set(10, 500_000_000);
    usage.sample([10], 1000);
    expect(usage.usageOf(10, 1000)).toBe(50);

    gpuClients.delete(10);
    usage.sample([], 2000);
    expect(usage.usageOf(10, 2000)).toBeNull();
    usage.stop();
  });
});
