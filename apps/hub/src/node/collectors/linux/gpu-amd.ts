import type { GpuSnapshot } from '@smarteverything/domain';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { celsius, orNull, percent, watts } from '../rounding';
import type { KernelFiles } from './kernel-file';

const DRM_ROOT = '/sys/class/drm';
const AMD_VENDOR = '0x1002';
const MILLI = 1000;
const MICRO = 1_000_000;

interface AmdCard {
  readonly id: string;
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
      id: basename(dirname(device)),
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

export function parseClocks(text: string): {
  readonly current: number | null;
  readonly max: number | null;
} {
  const levels = text.split('\n').flatMap((line) => {
    const match = /^\d+:\s*(\d+)\s*Mhz(\s*\*)?/i.exec(line);
    return match?.[1] === undefined
      ? []
      : [{ mhz: Number(match[1]), active: match[2] !== undefined }];
  });
  return {
    current: levels.find((level) => level.active)?.mhz ?? null,
    max: levels.length === 0 ? null : Math.max(...levels.map((level) => level.mhz)),
  };
}

function clocks(files: KernelFiles, card: AmdCard, file: string): ReturnType<typeof parseClocks> {
  const path = `${card.device}/${file}`;
  return existsSync(path) ? parseClocks(files.read(path)) : { current: null, max: null };
}

function fanPercent(files: KernelFiles, hwmon: string | null): number | null {
  if (hwmon === null) {
    return null;
  }
  const pwm = optional(files, `${hwmon}/pwm1`, 1);
  const max = optional(files, `${hwmon}/pwm1_max`, 1) ?? 255;
  return pwm === null ? null : percent((pwm / max) * 100);
}

export function readAmdCard(files: KernelFiles, card: AmdCard): GpuSnapshot {
  const read = (file: string): number => Number(files.read(`${card.device}/${file}`));
  const hwmon = card.hwmon;
  const engine = clocks(files, card, 'pp_dpm_sclk');
  const memory = clocks(files, card, 'pp_dpm_mclk');
  return {
    id: `amd-${card.id}`,
    name: card.name,
    vendor: 'amd',
    load: percent(read('gpu_busy_percent')),
    memoryUsedBytes: read('mem_info_vram_used'),
    memoryTotalBytes: read('mem_info_vram_total'),
    temperature: orNull(
      hwmon === null ? null : optional(files, `${hwmon}/temp1_input`, MILLI),
      celsius,
    ),
    powerWatts: orNull(
      hwmon === null ? null : optional(files, `${hwmon}/power1_average`, MICRO),
      watts,
    ),
    powerLimitWatts: hwmon === null ? null : optional(files, `${hwmon}/power1_cap`, MICRO),
    clockMhz: engine.current,
    maxClockMhz: engine.max,
    memoryClockMhz: memory.current,
    fanPercent: fanPercent(files, hwmon),
    encoderLoad: null,
    decoderLoad: null,
  };
}
