import { registerBrowser } from './browser.js';
import path from 'node:path';
import { Logger } from '@smarteverything/logging';
import { BrowserWindow, screen, shell, type WebContents } from 'electron';
import type { NativeHubCapabilities } from '@smarteverything/domain';
import { reportFailure } from './failure.js';
import { hubCapabilitiesArgument } from './hub-network/capabilities.js';
import { isAppOrigin, VERSION_ARGUMENT_PREFIX } from './origin.js';
import { isSafeExternalUrl } from './permissions.js';
import { MINIMUM_WINDOW_SIZE, placeWindow, type WindowState } from './window-bounds.js';
import { readWindowState, writeWindowState } from './window-state.js';

const log = new Logger('desktop.window');

export interface MainWindowOptions {
  readonly preload: string;
  readonly icon: string;
  readonly stateFile: string;
  readonly startUrl: string;
  readonly loadFailed: (window: BrowserWindow, error: unknown) => void;
  readonly version: string;
  readonly capabilities: NativeHubCapabilities;
  readonly startHidden: boolean;
  readonly isQuitting: () => boolean;
}

function initialState(stateFile: string): WindowState {
  return placeWindow({
    saved: readWindowState(stateFile),
    workAreas: screen.getAllDisplays().map((display) => display.workArea),
    primaryWorkArea: screen.getPrimaryDisplay().workArea,
  });
}

function protocolOf(url: string): string {
  return URL.canParse(url) ? new URL(url).protocol : 'unparseable';
}

function openExternally(url: string): void {
  const safe = isSafeExternalUrl(url);
  log.info('window.external_requested', { safe, protocol: protocolOf(url), length: url.length });
  if (safe) {
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
      log.debug('window.navigation_blocked', () => ({ protocol: protocolOf(url) }));
      event.preventDefault();
      openExternally(url);
    }
  });
  contents.on('will-attach-webview', (event) => {
    log.warn('window.webview_blocked');
    event.preventDefault();
  });
}

function persistOnClose(window: BrowserWindow, options: MainWindowOptions): void {
  window.on('close', (event) => {
    log.info('window.closing', { quitting: options.isQuitting(), maximized: window.isMaximized() });
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
      additionalArguments: [
        `${VERSION_ARGUMENT_PREFIX}${options.version}`,
        hubCapabilitiesArgument(options.capabilities),
      ],
    },
  });
  observeContents(window, state, options.startHidden);
  guardNavigation(window.webContents, options.startUrl);
  registerBrowser(window, options.startUrl);
  persistOnClose(window, options);
  window.once('ready-to-show', () => {
    log.info('window.ready_to_show', { startHidden: options.startHidden });
    if (state.maximized) {
      window.maximize();
    }
    if (!options.startHidden) {
      window.show();
    }
  });
  const loading = log.operation('window.load', { protocol: protocolOf(options.startUrl) });
  window
    .loadURL(options.startUrl)
    .then(() => {
      loading.succeeded();
    })
    .catch((error: unknown) => {
      loading.failed(error);
      options.loadFailed(window, error);
    });
  return window;
}

function observeContents(window: BrowserWindow, state: WindowState, startHidden: boolean): void {
  const contents = window.webContents;
  log.info('window.created', {
    width: state.bounds.width,
    height: state.bounds.height,
    maximized: state.maximized,
    startHidden,
  });
  contents.on('did-fail-load', (_event, code, description, ...frame) => {
    log.warn('window.load_failed', { code, description, isMainFrame: frame[1] });
  });
  contents.on('render-process-gone', (_event, details) => {
    log.error('window.renderer_gone', undefined, {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
  contents.on('unresponsive', () => {
    log.warn('window.unresponsive');
  });
  contents.on('responsive', () => {
    log.info('window.responsive');
  });
  window.on('show', () => {
    log.debug('window.shown');
  });
  window.on('hide', () => {
    log.debug('window.hidden');
  });
}

export function revealWindow(window: BrowserWindow): void {
  log.debug('window.revealing', () => ({
    minimized: window.isMinimized(),
    visible: window.isVisible(),
  }));
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}
