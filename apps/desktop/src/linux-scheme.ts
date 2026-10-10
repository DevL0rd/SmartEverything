import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Logger } from '@smarteverything/logging';
import { app } from 'electron';
import { readXdgEnvironment } from './environment.js';
import {
  declaresScheme,
  planSchemeRegistration,
  SCHEME_HANDLER_FILE,
  SCHEME_MIME_TYPE,
  schemeHandlerEntry,
  xdgDataLocations,
} from './scheme-handler.js';

const log = new Logger('desktop.scheme');
const run = promisify(execFile);
const DESKTOP_FILE_SUFFIX = '.desktop';

class SchemeRegistrationRefusedError extends Error {
  readonly received: string;

  constructor(received: string) {
    super(
      `xdg-mime must answer ${SCHEME_HANDLER_FILE} for ${SCHEME_MIME_TYPE} after registering it; ` +
        `received ${received === '' ? 'no handler' : received}`,
    );
    this.name = 'SchemeRegistrationRefusedError';
    this.received = received;
  }
}

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

async function currentDefaultHandler(): Promise<string> {
  const { stdout } = await run('xdg-mime', ['query', 'default', SCHEME_MIME_TYPE]);
  return stdout.trim();
}

async function registerLinuxSchemeHandler(): Promise<void> {
  const locations = xdgDataLocations(readXdgEnvironment(), app.getPath('home'));
  const userFile = path.join(locations.home, 'applications', SCHEME_HANDLER_FILE);
  const desiredEntry = schemeHandlerEntry(app.getName(), process.execPath);
  const plan = planSchemeRegistration({
    packagedHandlers: await packagedHandlers(locations.directories),
    userEntry: await readOptional(userFile),
    desiredEntry,
    currentDefault: await currentDefaultHandler(),
  });
  if (plan.kind === 'packaged') {
    log.info('desktop.scheme.packaged', { handlers: plan.handlers, mimeType: SCHEME_MIME_TYPE });
    return;
  }
  if (plan.kind === 'current') {
    log.info('desktop.scheme.current', { file: userFile, executable: process.execPath });
    return;
  }
  if (plan.writeEntry) {
    await mkdir(path.dirname(userFile), { recursive: true });
    await writeFile(userFile, desiredEntry, 'utf8');
  }
  await run('xdg-mime', ['default', SCHEME_HANDLER_FILE, SCHEME_MIME_TYPE]);
  const registered = await currentDefaultHandler();
  if (registered !== SCHEME_HANDLER_FILE) {
    throw new SchemeRegistrationRefusedError(registered);
  }
  log.info('desktop.scheme.registered', {
    file: userFile,
    executable: process.execPath,
    wroteEntry: plan.writeEntry,
  });
}

export function startLinuxSchemeRegistration(): void {
  registerLinuxSchemeHandler().catch((error: unknown) => {
    log.error('desktop.scheme.failed', error, { mimeType: SCHEME_MIME_TYPE });
  });
}
