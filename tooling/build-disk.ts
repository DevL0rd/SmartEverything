import { statfsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { BuildHostError, type BuildHostNeed } from './build-host.ts';

const GIB = 1024 ** 3;

export const BUILD_HEADROOM = 1.25;
export const ROOT_DISK_RESERVE_BYTES = 3 * GIB;

export interface GrowthBytes {
  readonly data: number;
  readonly checkout: number;
}

export const MEASURED_GROWTH: Readonly<Record<BuildHostNeed, GrowthBytes>> = {
  hub: { data: 1 * GIB, checkout: 0.5 * GIB },
  ui: { data: 1 * GIB, checkout: 0.1 * GIB },
  app: { data: 4.25 * GIB, checkout: 2.6 * GIB },
  desktop: { data: 2 * GIB, checkout: 2 * GIB },
};

export interface DiskLocation {
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
}

export interface DiskProbe {
  readonly device: (path: string) => number;
  readonly freeBytes: (path: string) => number;
}

export const SYSTEM_DISK_PROBE: DiskProbe = {
  device: (path) => statSync(path).dev,
  freeBytes: (path) => {
    const stats = statfsSync(path);
    return stats.bavail * stats.bsize;
  },
};

function mib(bytes: number): string {
  return `${String(Math.ceil(bytes / (1024 * 1024)))} MiB`;
}

export function requiredBytes(need: BuildHostNeed): GrowthBytes {
  const measured = MEASURED_GROWTH[need];
  return {
    data: Math.ceil(measured.data * BUILD_HEADROOM),
    checkout: Math.ceil(measured.checkout * BUILD_HEADROOM),
  };
}

export function diskLocations(
  layout: { readonly root: string },
  root: string,
  need: BuildHostNeed,
  home: string,
): readonly DiskLocation[] {
  const required = requiredBytes(need);
  return [
    { name: 'the data folder', path: layout.root, bytes: required.data },
    { name: 'the update checkout', path: root, bytes: required.checkout },
    { name: 'the home folder', path: home, bytes: 0 },
    { name: 'the system disk', path: '/', bytes: ROOT_DISK_RESERVE_BYTES },
  ];
}

export function diskProblems(
  locations: readonly DiskLocation[],
  probe: DiskProbe,
  dataPath: string,
  checkoutPath: string,
): readonly string[] {
  const dataDevice = probe.device(dataPath);
  const separate =
    probe.device(checkoutPath) === dataDevice
      ? []
      : [
          `the update checkout ${checkoutPath} is on a different disk than the data folder ${dataPath}: move it with tooling/move-update-checkout.ts so every build output lands on the data disk`,
        ];
  const perDevice = new Map<number, { path: string; names: string[]; bytes: number }>();
  for (const location of locations) {
    const device = probe.device(location.path);
    const entry = perDevice.get(device) ?? { path: location.path, names: [], bytes: 0 };
    entry.names.push(location.name);
    entry.bytes += location.bytes;
    perDevice.set(device, entry);
  }
  const short = [...perDevice.values()]
    .filter((entry) => entry.bytes > 0 && probe.freeBytes(entry.path) < entry.bytes)
    .map(
      (entry) =>
        `${entry.names.join(', ')} (${entry.path}) have ${mib(probe.freeBytes(entry.path))} free but this build needs ${mib(entry.bytes)}`,
    );
  return [...separate, ...short];
}

export function requireBuildDisk(
  layout: Pick<HubLayout, 'root'>,
  root: string,
  need: BuildHostNeed,
  where: { readonly probe?: DiskProbe; readonly home?: string } = {},
): void {
  const { probe = SYSTEM_DISK_PROBE, home = homedir() } = where;
  const problems = diskProblems(diskLocations(layout, root, need, home), probe, layout.root, root);
  if (problems.length > 0) throw new BuildHostError(problems);
}
