import path from 'node:path';
import { execLine } from './autostart.js';
import type { XdgEnvironment } from './environment.js';
import { DEEP_LINK_SCHEME } from './origin.js';

export const SCHEME_HANDLER_FILE = 'smarteverything.desktop';
export const SCHEME_MIME_TYPE = `x-scheme-handler/${DEEP_LINK_SCHEME}`;
const DEFAULT_DATA_DIRECTORIES = ['/usr/local/share', '/usr/share'] as const;
const DESKTOP_ENTRY_GROUP = '[Desktop Entry]';

export function schemeHandlerEntry(name: string, executable: string): string {
  return [
    DESKTOP_ENTRY_GROUP,
    'Type=Application',
    'Version=1.0',
    `Name=${name}`,
    `Exec=${execLine([executable])} %u`,
    `MimeType=${SCHEME_MIME_TYPE};`,
    'NoDisplay=true',
    'Terminal=false',
    '',
  ].join('\n');
}

function desktopEntryLines(entry: string): readonly string[] {
  const lines = entry.split(/\r?\n/u).map((line) => line.trim());
  const start = lines.indexOf(DESKTOP_ENTRY_GROUP);
  if (start === -1) {
    return [];
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('['));
  return end === -1 ? rest : rest.slice(0, end);
}

export function declaresScheme(entry: string): boolean {
  const mimeLine = desktopEntryLines(entry).find((line) => /^MimeType\s*=/u.test(line));
  if (mimeLine === undefined) {
    return false;
  }
  return mimeLine
    .slice(mimeLine.indexOf('=') + 1)
    .split(';')
    .some((mimeType) => mimeType.trim() === SCHEME_MIME_TYPE);
}

export interface XdgDataLocations {
  readonly home: string;
  readonly directories: readonly string[];
}

export function xdgDataLocations(
  environment: XdgEnvironment,
  homeDirectory: string,
): XdgDataLocations {
  const configuredHome = environment.XDG_DATA_HOME;
  const home =
    configuredHome !== undefined && path.isAbsolute(configuredHome)
      ? configuredHome
      : path.join(homeDirectory, '.local', 'share');
  const configured = (environment.XDG_DATA_DIRS ?? '')
    .split(':')
    .filter((directory) => path.isAbsolute(directory));
  const directories = configured.length === 0 ? DEFAULT_DATA_DIRECTORIES : configured;
  return {
    home,
    directories: directories.filter((directory) => path.resolve(directory) !== path.resolve(home)),
  };
}

export type SchemeRegistrationPlan =
  | { readonly kind: 'packaged'; readonly handlers: readonly string[] }
  | { readonly kind: 'current' }
  | { readonly kind: 'register'; readonly writeEntry: boolean };

export interface SchemeRegistrationState {
  readonly packagedHandlers: readonly string[];
  readonly userEntry: string | undefined;
  readonly desiredEntry: string;
  readonly currentDefault: string;
}

export function planSchemeRegistration(state: SchemeRegistrationState): SchemeRegistrationPlan {
  if (state.packagedHandlers.length > 0) {
    return { kind: 'packaged', handlers: state.packagedHandlers };
  }
  const entryIsCurrent = state.userEntry === state.desiredEntry;
  if (entryIsCurrent && state.currentDefault === SCHEME_HANDLER_FILE) {
    return { kind: 'current' };
  }
  return { kind: 'register', writeEntry: !entryIsCurrent };
}
