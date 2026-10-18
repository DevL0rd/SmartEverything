import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Logger } from '@smarteverything/logging';
import { app } from 'electron';
import { readXdgEnvironment } from './environment.js';
import {
  declaresScheme,
  SCHEME_HANDLER_FILE,
  SCHEME_MIME_TYPE,
  schemeHandlerEntry,
  xdgDataLocations,
} from './scheme-handler.js';

const log = new Logger('desktop.scheme');
const run = promisify(execFile);
const DESKTOP_FILE_SUFFIX = '.desktop';

function isAbsentPath(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error: unknown) {
    if (isAbsentPath(error)) {
      return undefined;
    }
    throw error;
  }
}

async function desktopFilesIn(directory: string): Promise<readonly string[]> {
  try {
    const names = await readdir(directory);
    return names
      .filter((name) => name.endsWith(DESKTOP_FILE_SUFFIX))
      .map((name) => path.join(directory, name));
  } catch (error: unknown) {
    if (isAbsentPath(error)) {
      return [];
    }
    throw error;
  }
}

async function packagedHandlers(directories: readonly string[]): Promise<readonly string[]> {
  const files = (
    await Promise.all(
      directories.map((directory) => desktopFilesIn(path.join(directory, 'applications'))),
    )
  ).flat();
  const declaring = await Promise.all(
    files.map(async (file) => {
      const entry = await readOptional(file);
      return entry !== undefined && declaresScheme(entry) ? file : undefined;
    }),
  );
  return declaring.filter((file) => file !== undefined);
}

async function registerLinuxSchemeHandler(): Promise<void> {
  const locations = xdgDataLocations(readXdgEnvironment(), app.getPath('home'));
  const handlers = await packagedHandlers(locations.directories);
  if (handlers.length > 0) {
    log.info('desktop.scheme.packaged', { handlers, mimeType: SCHEME_MIME_TYPE });
    return;
  }
  const userFile = path.join(locations.home, 'applications', SCHEME_HANDLER_FILE);
  await mkdir(path.dirname(userFile), { recursive: true });
  await writeFile(userFile, schemeHandlerEntry(app.getName(), process.execPath), 'utf8');
  await run('xdg-mime', ['default', SCHEME_HANDLER_FILE, SCHEME_MIME_TYPE]);
  log.info('desktop.scheme.registered', { file: userFile, executable: process.execPath });
}

export function startLinuxSchemeRegistration(): void {
  registerLinuxSchemeHandler().catch((error: unknown) => {
    log.error('desktop.scheme.failed', error, { mimeType: SCHEME_MIME_TYPE });
  });
}
