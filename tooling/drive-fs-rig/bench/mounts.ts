import { readFile } from 'node:fs/promises';

export async function isMounted(point: string): Promise<boolean> {
  return (await readFile('/proc/self/mounts', 'utf8'))
    .split('\n')
    .some((line) => line.split(' ')[1] === point);
}
