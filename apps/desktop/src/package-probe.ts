import type { DesktopServiceStatus } from '@smarteverything/domain';
import { app, BrowserWindow, ipcMain } from 'electron';
import { Logger } from '@smarteverything/logging';
import { hubCapabilities, hubCapabilitiesArgument } from './hub-network/capabilities.js';
import { APP_START_URL, VERSION_ARGUMENT_PREFIX } from './origin.js';
import type { DesktopPaths } from './paths.js';
import { serveWebExport } from './protocol.js';

export const DESKTOP_PACKAGE_PROBE = '--verify-desktop-package';
export const DESKTOP_PACKAGE_VERSION = '--verify-desktop-version=';
const log = new Logger('desktop.package');

function registerProbeIpc(dataDirectory: string): void {
  ipcMain.handle('desktop:service-status', (): DesktopServiceStatus => ({
    manager: 'systemd',
    health: 'not-installed',
    installed: false,
    active: false,
    url: null,
    dataDirectory,
    detail: 'Isolated desktop package check.',
    linger: 'unsupported',
  }));
  ipcMain.handle('desktop:server', () => null);
  ipcMain.handle('desktop:take-deep-links', () => []);
  ipcMain.handle('desktop:hub-discovery-stop', () => undefined);
  ipcMain.handle('desktop:web-update-report-failure', () => {
    log.warn('package.route_failed');
    app.exit(1);
  });
}

async function load(paths: DesktopPaths): Promise<void> {
  await app.whenReady();
  serveWebExport(() => paths.webRoot);
  registerProbeIpc(paths.dataDirectory);
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: paths.preload,
      sandbox: true,
      contextIsolation: true,
      additionalArguments: [
        `${VERSION_ARGUMENT_PREFIX}${app.getVersion()}`,
        hubCapabilitiesArgument(hubCapabilities(false)),
      ],
    },
  });
  window.webContents.once('preload-error', (_event, _file, error) => {
    log.error('package.preload_failed', error);
    app.exit(1);
  });
  window.webContents.once('render-process-gone', () => {
    app.exit(1);
  });
  await window.loadURL(APP_START_URL);
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const root = document.getElementById('root');
      if (root === null) throw new Error('The desktop renderer has no root.');
      const observer = new MutationObserver(check);
      function check() {
        if (!root.textContent.includes('Welcome to SmartEverything')) return;
        const actions = Array.from(root.querySelectorAll('button, [role="button"]'));
        if (!actions.some((action) => action.textContent === 'Scan pairing code')) return;
        observer.disconnect();
        resolve();
      }
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      check();
    })
  `);
}

export function desktopPackageProbe(paths: DesktopPaths): void {
  const expected = process.argv
    .find((argument) => argument.startsWith(DESKTOP_PACKAGE_VERSION))
    ?.slice(DESKTOP_PACKAGE_VERSION.length);
  if (expected !== app.getVersion()) {
    log.warn('package.version_mismatch', { expected, installed: app.getVersion() });
    app.exit(1);
    return;
  }
  load(paths).then(
    () => {
      log.info('package.pairing_screen_loaded');
      app.exit(0);
    },
    (error: unknown) => {
      log.error('package.start_failed', error);
      app.exit(1);
    },
  );
}
