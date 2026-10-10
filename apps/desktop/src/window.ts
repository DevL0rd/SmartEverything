import path from 'node:path';
import { BrowserWindow, dialog, screen, shell, type WebContents } from 'electron';
import { reportFailure } from './failure.js';
import { isAppOrigin, VERSION_ARGUMENT_PREFIX } from './origin.js';
import { isSafeExternalUrl } from './permissions.js';
import { MINIMUM_WINDOW_SIZE, placeWindow, type WindowState } from './window-bounds.js';
import { readWindowState, WindowStateInvalidError, writeWindowState } from './window-state.js';

export interface MainWindowOptions {
  readonly preload: string;
  readonly icon: string;
  readonly stateFile: string;
  readonly startUrl: string;
  readonly loadFailed: (window: BrowserWindow, error: unknown) => void;
  readonly version: string;
  readonly startHidden: boolean;
  readonly isQuitting: () => boolean;
}

function savedState(stateFile: string): WindowState | undefined {
  try {
    return readWindowState(stateFile);
  } catch (error: unknown) {
    if (error instanceof WindowStateInvalidError) {
      dialog.showErrorBox(
        'Saved window position discarded',
        `${error.message}. The window opens centred on the primary display instead.`,
      );
      return undefined;
    }
    throw error;
  }
}

function initialState(stateFile: string): WindowState {
  return placeWindow({
    saved: savedState(stateFile),
    workAreas: screen.getAllDisplays().map((display) => display.workArea),
    primaryWorkArea: screen.getPrimaryDisplay().workArea,
  });
}

function openExternally(url: string): void {
  if (isSafeExternalUrl(url)) {
    shell.openExternal(url).catch((error: unknown) => {
      reportFailure('The link could not be opened in the browser', error);
    });
  }
}

function guardNavigation(contents: WebContents, startUrl: string): void {
  contents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAppOrigin(url, startUrl)) {
      event.preventDefault();
      openExternally(url);
    }
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

function persistOnClose(window: BrowserWindow, options: MainWindowOptions): void {
  window.on('close', (event) => {
    writeWindowState(options.stateFile, {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
    });
    if (!options.isQuitting()) {
      event.preventDefault();
      window.hide();
    }
  });
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const state = initialState(options.stateFile);
  const window = new BrowserWindow({
    ...state.bounds,
    minWidth: MINIMUM_WINDOW_SIZE.width,
    minHeight: MINIMUM_WINDOW_SIZE.height,
    show: false,
    icon: options.icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.resolve(options.preload),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: [`${VERSION_ARGUMENT_PREFIX}${options.version}`],
    },
  });
  guardNavigation(window.webContents, options.startUrl);
  persistOnClose(window, options);
  window.once('ready-to-show', () => {
    if (state.maximized) {
      window.maximize();
    }
    if (!options.startHidden) {
      window.show();
    }
  });
  window.loadURL(options.startUrl).catch((error: unknown) => {
    options.loadFailed(window, error);
  });
  return window;
}

export function revealWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}
