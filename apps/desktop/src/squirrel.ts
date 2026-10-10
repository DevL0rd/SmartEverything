import path from 'node:path';

const SQUIRREL_APP_NAME = 'smarteverything';
const EXECUTABLE_FILE = `${SQUIRREL_APP_NAME}.exe`;
export const WINDOWS_APP_USER_MODEL_ID = `com.squirrel.${SQUIRREL_APP_NAME}.${SQUIRREL_APP_NAME}`;

const SQUIRREL_EVENTS = {
  '--squirrel-install': 'install',
  '--squirrel-updated': 'updated',
  '--squirrel-uninstall': 'uninstall',
  '--squirrel-obsolete': 'obsolete',
} as const;

export type SquirrelEvent = (typeof SQUIRREL_EVENTS)[keyof typeof SQUIRREL_EVENTS];

function isSquirrelFlag(candidate: string): candidate is keyof typeof SQUIRREL_EVENTS {
  return Object.hasOwn(SQUIRREL_EVENTS, candidate);
}

export function squirrelEventOf(
  platform: NodeJS.Platform,
  argv: readonly string[],
): SquirrelEvent | undefined {
  const flag = argv[1];
  if (platform !== 'win32' || flag === undefined || !isSquirrelFlag(flag)) {
    return undefined;
  }
  return SQUIRREL_EVENTS[flag];
}

export function updateExecutableOf(execPath: string): string {
  return path.win32.resolve(path.win32.dirname(execPath), '..', 'Update.exe');
}

export function shortcutArguments(event: SquirrelEvent): readonly string[] | undefined {
  switch (event) {
    case 'install':
    case 'updated':
      return ['--createShortcut', EXECUTABLE_FILE];
    case 'uninstall':
      return ['--removeShortcut', EXECUTABLE_FILE];
    case 'obsolete':
      return undefined;
  }
}

export interface WindowsLoginItem {
  readonly path: string;
  readonly args: string[];
}

export function windowsLoginItem(execPath: string, hiddenArgument: string): WindowsLoginItem {
  return {
    path: updateExecutableOf(execPath),
    args: ['--processStart', `"${EXECUTABLE_FILE}"`, '--process-start-args', `"${hiddenArgument}"`],
  };
}
