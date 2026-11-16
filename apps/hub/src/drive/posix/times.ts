import { lutimes } from 'node:fs/promises';
import { nsOfMoment } from '../../store/repositories/drive-inodes';

const NS_PER_SECOND = 1_000_000_000n;

const SECONDS_PER_DAY = 86_400n;

export const RELATIME_WINDOW_NS = SECONDS_PER_DAY * NS_PER_SECOND;

export interface Clock {
  readonly now: () => Date;
}

export interface InodeTimes {
  readonly atimeNs: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

const NS_PER_MS = 1_000_000n;

const MS_PER_SECOND = 1000;

const MID_MS = 0.5;

export function diskSecondsOf(ns: bigint): number {
  return (Number(ns / NS_PER_MS) + MID_MS) / MS_PER_SECOND;
}

export async function stampDiskTimes(
  path: string,
  atimeNs: bigint,
  mtimeNs: bigint,
): Promise<void> {
  await lutimes(path, diskSecondsOf(atimeNs), diskSecondsOf(mtimeNs));
}

export function nowNs(clock: Clock): bigint {
  return nsOfMoment(clock.now().toISOString());
}

export function after(prior: bigint, candidate: bigint): bigint {
  return candidate > prior ? candidate : prior + 1n;
}

export function relatimeDue(times: InodeTimes, now: bigint): boolean {
  return (
    times.atimeNs <= times.mtimeNs ||
    times.atimeNs <= times.ctimeNs ||
    now - times.atimeNs >= RELATIME_WINDOW_NS
  );
}
