import { readFileSync } from 'node:fs';
import { Logger } from '@smarteverything/logging';

const log = new Logger('tool.pinned-versions');

interface Manifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

const RANGE = /^[\^~><=]|\s-\s|\|\|/;

function manifestAt(path: string): Manifest {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`${path} does not hold an object`);
  }
  return parsed;
}

const manifest = manifestAt('package.json');
const ranged: string[] = [];

for (const section of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
  for (const [name, version] of Object.entries(manifest[section] ?? {})) {
    if (RANGE.test(version)) {
      ranged.push(`${section}.${name}@${version}`);
    }
  }
}

if (ranged.length > 0) {
  log.warn('dependencies.not_pinned', { count: ranged.length, ranged });
  process.exitCode = 1;
} else {
  log.info('dependencies.all_pinned');
}
