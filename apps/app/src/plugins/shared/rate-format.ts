import { decimal } from '../../format/number';

export function megabits(mbps: number): string {
  return mbps >= 100 ? `${decimal(mbps)} Mb/s` : `${decimal(mbps, 1)} Mb/s`;
}

export function milliseconds(ms: number): string {
  return `${decimal(ms)} ms`;
}
