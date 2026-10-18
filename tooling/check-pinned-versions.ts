import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { unpinnedDependencies, workspaceManifests } from './pinned-versions';

const log = new Logger('tool.pinned-versions');

const root = process.cwd();

const ranged = workspaceManifests(root).flatMap((path) => {
  const manifest: unknown = JSON.parse(readFileSync(join(root, path), 'utf8'));
  return unpinnedDependencies(path, manifest);
});

if (ranged.length > 0) {
  log.warn('dependencies.not_pinned', { count: ranged.length, ranged });
  process.exitCode = 1;
} else {
  log.info('dependencies.all_pinned');
}
