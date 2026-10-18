import { execFileSync } from 'node:child_process';

let cached: number | null = null;

export function pageBytes(): number {
  cached ??= Number(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }));
  return cached;
}
