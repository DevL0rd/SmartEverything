import { readFileSync } from 'node:fs';
import type { DesktopPlatform } from '@smarteverything/domain';

const HYBRID_EFFICIENCY_CORES = '/sys/devices/cpu_atom/cpus';

export function efficiencyCores(
  platform: DesktopPlatform,
  read: (file: string) => string = (file) => readFileSync(file, 'utf8'),
): string | null {
  if (platform !== 'linux') {
    return null;
  }
  try {
    const cores = read(HYBRID_EFFICIENCY_CORES).trim();
    return cores === '' ? null : cores;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
