import { describe, expect, it } from 'vitest';
import {
  shortcutArguments,
  squirrelEventOf,
  updateExecutableOf,
  WINDOWS_APP_USER_MODEL_ID,
  windowsLoginItem,
} from '../src/squirrel.js';

const EXECUTABLE =
  'C:\\Users\\Ann\\AppData\\Local\\smarteverything\\app-1.2.3\\smarteverything.exe';

describe('Squirrel install events', () => {
  it('reads each Squirrel flag on Windows only', () => {
    expect(squirrelEventOf('win32', [EXECUTABLE, '--squirrel-install', '1.2.3'])).toBe('install');
    expect(squirrelEventOf('win32', [EXECUTABLE, '--squirrel-updated', '1.2.3'])).toBe('updated');
    expect(squirrelEventOf('win32', [EXECUTABLE, '--squirrel-uninstall', '1.2.3'])).toBe(
      'uninstall',
    );
    expect(squirrelEventOf('win32', [EXECUTABLE, '--squirrel-obsolete', '1.2.3'])).toBe('obsolete');
    expect(
      squirrelEventOf('linux', ['/opt/smarteverything', '--squirrel-install']),
    ).toBeUndefined();
    expect(squirrelEventOf('darwin', ['/Applications/x', '--squirrel-install'])).toBeUndefined();
  });

  it('ignores a first run, ordinary arguments and a flag in any other position', () => {
    expect(squirrelEventOf('win32', [EXECUTABLE, '--squirrel-firstrun'])).toBeUndefined();
    expect(squirrelEventOf('win32', [EXECUTABLE])).toBeUndefined();
    expect(
      squirrelEventOf('win32', [EXECUTABLE, '--hidden', '--squirrel-install']),
    ).toBeUndefined();
    expect(squirrelEventOf('win32', [EXECUTABLE, 'toString'])).toBeUndefined();
    expect(squirrelEventOf('win32', [EXECUTABLE, '__proto__'])).toBeUndefined();
  });

  it('finds Update.exe one level above the versioned app folder', () => {
    expect(updateExecutableOf(EXECUTABLE)).toBe(
      'C:\\Users\\Ann\\AppData\\Local\\smarteverything\\Update.exe',
    );
  });

  it('creates shortcuts on install and update, removes them on uninstall, and does nothing when obsolete', () => {
    expect(shortcutArguments('install')).toEqual(['--createShortcut', 'smarteverything.exe']);
    expect(shortcutArguments('updated')).toEqual(['--createShortcut', 'smarteverything.exe']);
    expect(shortcutArguments('uninstall')).toEqual(['--removeShortcut', 'smarteverything.exe']);
    expect(shortcutArguments('obsolete')).toBeUndefined();
  });

  it('starts at login through Update.exe so the item survives updates', () => {
    expect(windowsLoginItem(EXECUTABLE, '--hidden')).toEqual({
      path: 'C:\\Users\\Ann\\AppData\\Local\\smarteverything\\Update.exe',
      args: ['--processStart', '"smarteverything.exe"', '--process-start-args', '"--hidden"'],
    });
  });

  it('uses the AppUserModelID Squirrel gives its shortcuts', () => {
    expect(WINDOWS_APP_USER_MODEL_ID).toBe('com.squirrel.smarteverything.smarteverything');
  });
});
