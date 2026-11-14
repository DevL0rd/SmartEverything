import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { AppUpdateEntry } from '@smarteverything/domain';
import { pnpmProgram } from './build-host.ts';
import { releaseOptions } from './publish-app-update-android.ts';
import {
  contentTypeOf,
  PublishOutputError,
  publishPrepared,
  type Dependencies,
  type PreparedUpdate,
  type PublishRequest,
} from './publish-app-update-shared.ts';
import { buildEnvironment, type Command } from './release-android.ts';

const ROOT = join(import.meta.dirname, '..');

export const WEB_EXPORT = join(ROOT, 'apps', 'app', 'dist');

export const DESKTOP_DIRECTORY = join(ROOT, 'apps', 'desktop');
const ENTRY_FILE = 'index.html';
const BUNDLE_FILE = 'bundle.json';

export function webExportCommand(server: string): Command {
  return {
    title: 'export the desktop web bundle',
    program: pnpmProgram(),
    args: ['--filter', '@smarteverything/app', 'run', 'export:web'],
    cwd: ROOT,
    environment: buildEnvironment(releaseOptions(server)),
  };
}

export async function exportedPaths(webDirectory: string): Promise<readonly string[]> {
  const found = await readdir(webDirectory, { recursive: true, withFileTypes: true });
  return found
    .filter((one) => one.isFile())
    .map((one) => relative(webDirectory, join(one.parentPath, one.name)).split(sep).join('/'))
    .sort();
}

export async function prepareDesktop(
  request: Pick<PublishRequest, 'server'>,
  dependencies: Dependencies,
): Promise<PreparedUpdate> {
  dependencies.run(webExportCommand(request.server));
  const paths = await exportedPaths(dependencies.webDirectory);
  if (
    !paths.includes(ENTRY_FILE) ||
    (await stat(join(dependencies.webDirectory, ENTRY_FILE))).size === 0
  ) {
    throw new PublishOutputError('desktop web export', `expected a nonempty ${ENTRY_FILE}`);
  }
  if (paths.includes(BUNDLE_FILE)) {
    throw new PublishOutputError(
      'desktop web export',
      `${BUNDLE_FILE} is reserved by the desktop updater`,
    );
  }
  const runtimeVersion = await dependencies.desktopRuntime();
  return {
    platform: 'desktop',
    runtimeVersion,
    launch: null,
    files: paths.map((path) => ({
      source: join(dependencies.webDirectory, path),
      path,
      contentType: contentTypeOf(path),
    })),
    expoClient: null,
  };
}

export function publishDesktop(
  request: PublishRequest,
  dependencies: Dependencies,
): Promise<AppUpdateEntry> {
  return publishPrepared(request, () => prepareDesktop(request, dependencies));
}
