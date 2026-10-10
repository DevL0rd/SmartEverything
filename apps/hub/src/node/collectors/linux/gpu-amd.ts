import type { GpuSnapshot } from '@smarteverything/domain';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { KernelFiles } from './kernel-file';

const DRM_ROOT = '/sys/class/drm';
const AMD_VENDOR = '0x1002';
const MILLI = 1000;
const MICRO = 1_000_000;

interface AmdCard {
  readonly name: string;
  readonly device: string;
  readonly hwmon: string | null;
}

function hwmonOf(device: string): string | null {
  const root = `${device}/hwmon`;
  const first = existsSync(root) ? readdirSync(root)[0] : undefined;
  return first === undefined ? null : `${root}/${first}`;
}

export function scanAmdCards(): AmdCard[] {
  return readdirSync(DRM_ROOT)
    .filter((name) => /^card\d+$/.test(name))
    .map((name) => `${DRM_ROOT}/${name}/device`)
    .filter(
      (device) =>
        existsSync(`${device}/vendor`) &&
        readFileSync(`${device}/vendor`, 'utf8').trim() === AMD_VENDOR &&
        existsSync(`${device}/gpu_busy_percent`),
    )
    .map((device) => ({
      name: existsSync(`${device}/product_name`)
        ? readFileSync(`${device}/product_name`, 'utf8').trim()
        : 'AMD graphics',
      device,
      hwmon: hwmonOf(device),
    }));
}

function optional(files: KernelFiles, path: string, scale: number): number | null {
  return existsSync(path) ? Number(files.read(path)) / scale : null;
}

export function readAmdCard(files: KernelFiles, card: AmdCard): GpuSnapshot {
  const read = (file: string): number => Number(files.read(`${card.device}/${file}`));
  return {
    name: card.name,
    vendor: 'amd',
    load: read('gpu_busy_percent'),
    memoryUsedBytes: read('mem_info_vram_used'),
    memoryTotalBytes: read('mem_info_vram_total'),
    temperature: card.hwmon === null ? null : optional(files, `${card.hwmon}/temp1_input`, MILLI),
    powerWatts: card.hwmon === null ? null : optional(files, `${card.hwmon}/power1_average`, MICRO),
    powerLimitWatts:
      card.hwmon === null ? null : optional(files, `${card.hwmon}/power1_cap`, MICRO),
    clockMhz: null,
    maxClockMhz: null,
  };
}
