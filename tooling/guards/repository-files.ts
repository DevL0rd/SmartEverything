import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const repositoryRoot = join(import.meta.dirname, '..', '..');
export const applicationSource = join(repositoryRoot, 'apps', 'app', 'src');
export const applicationRoutes = join(repositoryRoot, 'apps', 'app', 'app');

export function filesUnder(from: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(from)) {
    const at = join(from, entry);
    if (statSync(at).isDirectory()) {
      found.push(...filesUnder(at));
    } else {
      found.push(at);
    }
  }
  return found;
}

export function insideApp(file: string): string {
  return relative(join(repositoryRoot, 'apps', 'app'), file).replace(/\\/g, '/');
}
