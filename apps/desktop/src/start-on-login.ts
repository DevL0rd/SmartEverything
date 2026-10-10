import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { AUTOSTART_FILE, autostartEntry } from './autostart.js';
import { HIDDEN_START_ARGUMENT } from './origin.js';
import { windowsLoginItem } from './squirrel.js';

class SquirrelInstallMissingError extends Error {
  readonly expected: string;

  constructor(expected: string) {
    super(
      `start on login launches SmartEverything through Squirrel's ${expected}; ` +
        'received an app that was not installed by its Setup.exe',
    );
    this.name = 'SquirrelInstallMissingError';
    this.expected = expected;
  }
}

function autostartFile(): string {
  return path.join(app.getPath('appData'), 'autostart', AUTOSTART_FILE);
}

function setLinuxStartOnLogin(enabled: boolean): void {
  const file = autostartFile();
  if (!enabled) {
    rmSync(file, { force: true });
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    autostartEntry(app.getName(), [process.execPath, HIDDEN_START_ARGUMENT]),
    'utf8',
  );
}

interface LoginItem {
  readonly path?: string;
  readonly args: string[];
}

function loginItem(): LoginItem {
  if (process.platform === 'win32' && app.isPackaged) {
    return windowsLoginItem(process.execPath, HIDDEN_START_ARGUMENT);
  }
  return { args: [HIDDEN_START_ARGUMENT] };
}

export function wasOpenedAtLogin(): boolean {
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
}

export function getStartOnLogin(): boolean {
  if (process.platform === 'linux') {
    return existsSync(autostartFile());
  }
  return app.getLoginItemSettings(loginItem()).openAtLogin;
}

export function setStartOnLogin(enabled: boolean): boolean {
  if (process.platform === 'linux') {
    setLinuxStartOnLogin(enabled);
    return getStartOnLogin();
  }
  const item = loginItem();
  if (item.path !== undefined && enabled && !existsSync(item.path)) {
    throw new SquirrelInstallMissingError(item.path);
  }
  app.setLoginItemSettings({ ...item, openAtLogin: enabled });
  return getStartOnLogin();
}

export function removeWindowsLoginItem(): void {
  app.setLoginItemSettings({
    ...windowsLoginItem(process.execPath, HIDDEN_START_ARGUMENT),
    openAtLogin: false,
  });
}
