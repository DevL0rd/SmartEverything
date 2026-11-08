import { access } from 'node:fs/promises';
import { CommandFailedError, type RunCommand } from '../service/system.js';
import { fuse3Command, probeTier, type TierPorts } from './placement-tier.js';

const FUSE_DEVICE = '/dev/fuse';
const FUSERMOUNT = 'fusermount3';
const LOAD_MODULE = 'sudo modprobe fuse';

export type FuseMissing = typeof FUSE_DEVICE | typeof FUSERMOUNT;

export type FuseStatus =
  | { readonly available: true }
  | {
      readonly available: false;
      readonly missing: readonly FuseMissing[];
      readonly command: string | null;
      readonly reason: string;
    };

export interface FuseProbePorts extends TierPorts {
  readonly exists: (file: string) => Promise<boolean>;
}

export const nodeFuseExists: FuseProbePorts['exists'] = async (file) => {
  try {
    await access(file);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
};

function reasonOf(missing: readonly FuseMissing[], command: string | null): string {
  const lacks = `Full drive needs ${missing.join(' and ')}`;
  return command === null ? lacks : `${lacks}. Run: ${command}`;
}

export async function detectFuse(ports: FuseProbePorts): Promise<FuseStatus> {
  const [device, tier] = await Promise.all([ports.exists(FUSE_DEVICE), probeTier('linux', ports)]);
  const missing: FuseMissing[] = [];
  if (!device) missing.push(FUSE_DEVICE);
  if (tier !== 'full') missing.push(FUSERMOUNT);
  if (missing.length === 0) return { available: true };
  const command = tier === 'full' ? LOAD_MODULE : await fuse3Command(ports.readText);
  return { available: false, missing, command, reason: reasonOf(missing, command) };
}

export async function recoverStaleMount(run: RunCommand, point: string): Promise<boolean> {
  try {
    await run(FUSERMOUNT, ['-u', point]);
    return true;
  } catch (cause) {
    if (cause instanceof CommandFailedError) return false;
    throw cause;
  }
}
