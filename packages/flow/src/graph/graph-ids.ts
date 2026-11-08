import { sha256Hex } from '../functions/sha256';

const PREFIX = 'automation-graph:';

export function graphNodeId(owner: string, role: string): string {
  const hex = sha256Hex(`${PREFIX}${owner}:${role}`).slice(0, 32);
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export function graphKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${String(suffix)}`)) suffix += 1;
  return `${base}_${String(suffix)}`;
}
