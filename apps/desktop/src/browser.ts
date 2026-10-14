import { registerHtmlPreviewIpc } from './html-preview/ipc.js';
import { Logger } from '@smarteverything/logging';
import { ipcMain, type BrowserWindow, type WebContentsView } from 'electron';
import {
  BROWSER_COMMAND,
  BROWSER_RETIRED_PROBLEM,
  BrowserPolicyError,
  browserAllows,
  type BrowserCommand,
  type BrowserTarget,
} from '@smarteverything/domain';
import { BrowserDiagnostics } from './browser-diagnostics.js';
import { NATIVE_BROWSER_OPERATION, NATIVE_BROWSER_OBSERVE } from '@smarteverything/domain';
import { createBrowserView } from './browser-session.js';
import { isAppOrigin } from './origin.js';

const log = new Logger('desktop.browser');
const failures = new WeakMap<WebContentsView, string>();
const MAX_BROWSER_CONTEXTS = 16;

interface Page {
  readonly view: WebContentsView;
  readonly target: BrowserTarget;
  readonly diagnostics: BrowserDiagnostics;
}
const diagnosticVersions = new WeakMap<BrowserWindow, 2 | undefined>();
export function registerBrowser(window: BrowserWindow, startUrl: string): void {
  registerHtmlPreviewIpc(window, startUrl);
  const pages = new Map<string, Page>();
  diagnosticVersions.set(window, undefined);
  ipcMain.handle('desktop:browser', (event, value: unknown) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !isAppOrigin(event.senderFrame.url, startUrl)
    )
      throw new BrowserPolicyError('Browser commands require the main app frame.');
    apply(window, pages, BROWSER_COMMAND.parse(value));
  });
  ipcMain.handle('desktop:browser-diagnostics', async (event, value: unknown) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !isAppOrigin(event.senderFrame.url, startUrl)
    )
      throw new BrowserPolicyError('Diagnostics require the app main frame.');
    const input = NATIVE_BROWSER_OPERATION.parse(value);
    const page = pages.get(input.id);
    if (page === undefined) throw new BrowserPolicyError('This browser was closed.');
    return page.diagnostics.perform(input.epoch, input.action);
  });
  observeDiagnostics(window, startUrl, pages);
  window.on('closed', () => {
    ipcMain.removeHandler('desktop:browser-diagnostics');
    ipcMain.removeAllListeners('desktop:browser-observe');
    ipcMain.removeHandler('desktop:browser');
    for (const page of pages.values()) page.view.webContents.close();
    pages.clear();
  });
  window.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
    if (!mainFrame || inPlace) return;
    for (const page of pages.values()) {
      window.contentView.removeChildView(page.view);
      closePage(page);
    }
    pages.clear();
  });
}
function observeDiagnostics(
  window: BrowserWindow,
  startUrl: string,
  pages: ReadonlyMap<string, Page>,
): void {
  ipcMain.on('desktop:browser-observe', (event, value: unknown) => {
    if (
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      isAppOrigin(event.senderFrame.url, startUrl)
    ) {
      const version = NATIVE_BROWSER_OBSERVE.parse(value);
      diagnosticVersions.set(window, version);
      for (const page of pages.values()) page.diagnostics.observe(version);
    }
  });
}
function emit(window: BrowserWindow, page: Page, problem: string | null): void {
  const contents = page.view.webContents;
  if (problem !== null) failures.set(page.view, problem);
  if (contents.isDestroyed() || window.isDestroyed()) return;
  const url = new URL(contents.getURL() || page.target.url);
  if (url.pathname === '/.se-preview/bootstrap') url.search = '';
  window.webContents.send('desktop:browser-status', {
    id: page.target.id,
    url: url.href,
    loading: contents.isLoading(),
    back: contents.navigationHistory.canGoBack(),
    forward: contents.navigationHistory.canGoForward(),
    problem,
  });
}
function create(window: BrowserWindow, target: BrowserTarget): Page {
  if (!browserAllows(target, target.url))
    throw new BrowserPolicyError('Browser target has an invalid origin.');
  const view = createBrowserView(target, window.webContents.id);
  const page = { target, view, diagnostics: new BrowserDiagnostics(window, view, target.id) };
  page.diagnostics.observe(diagnosticVersions.get(window));
  page.view.setVisible(false);
  window.contentView.addChildView(page.view);
  const contents = page.view.webContents;
  const changed = (): void => {
    emit(window, page, failures.get(page.view) ?? null);
  };
  contents.on('did-start-loading', () => {
    failures.delete(page.view);
    emit(window, page, null);
  });
  contents.on('did-stop-loading', changed);
  contents.on('did-navigate', changed);
  contents.on('did-navigate-in-page', changed);
  contents.on('did-fail-load', (...failure) => {
    if (failure[4] && failure[1] !== -3)
      emit(window, page, 'The page could not be loaded. Check the service and try again.');
  });
  contents.once('destroyed', () => {
    if (!window.isDestroyed())
      window.webContents.send('desktop:browser-status', {
        id: target.id,
        url: '',
        loading: false,
        back: false,
        forward: false,
        problem: BROWSER_RETIRED_PROBLEM,
      });
  });
  contents.on('render-process-gone', () => {
    emit(window, page, 'The browser process stopped. Open the page again.');
  });
  openPage(window, page);
  return page;
}
function openPage(window: BrowserWindow, page: Page): void {
  const contents = page.view.webContents;
  const target = page.target;
  void contents
    .loadURL(target.url)
    .then(() => {
      if (target.kind !== 'preview' || contents.isDestroyed()) return undefined;
      const wanted = new URL(target.initialPath, target.origin).href;
      if (contents.getURL() !== wanted) return contents.loadURL(wanted);
      return undefined;
    })
    .catch(() => {
      emit(window, page, 'The page could not be loaded.');
    });
}
function apply(window: BrowserWindow, pages: Map<string, Page>, command: BrowserCommand): void {
  if (command.kind === 'open') {
    if (pages.size >= MAX_BROWSER_CONTEXTS)
      throw new BrowserPolicyError('Close another browser before opening more pages.');
    if (pages.has(command.target.id))
      throw new BrowserPolicyError('Browser context already exists.');
    pages.set(command.target.id, create(window, command.target));
    return;
  }
  const page = pages.get(command.id);
  if (page === undefined) throw new BrowserPolicyError('Browser context is no longer available.');
  if (command.kind === 'layout') {
    page.view.setBounds(command.bounds);
    page.view.setVisible(command.visible);
    page.diagnostics.layout(command.visible);
    return;
  }
  if (command.kind === 'navigate') {
    if (!browserAllows(page.target, command.url))
      throw new BrowserPolicyError('This address is outside this browser context.');
    void page.view.webContents.loadURL(command.url).catch(() => {
      emit(window, page, 'The page could not be loaded.');
    });
    return;
  }
  action(window, page, command.action);
  if (command.action === 'destroy') pages.delete(command.id);
}
function action(
  window: BrowserWindow,
  page: Page,
  command: 'back' | 'forward' | 'reload' | 'stop' | 'destroy',
): void {
  const contents = page.view.webContents;
  switch (command) {
    case 'back':
      if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
      return;
    case 'forward':
      if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
      return;
    case 'reload':
      contents.reload();
      return;
    case 'stop':
      contents.stop();
      return;
    case 'destroy':
      window.contentView.removeChildView(page.view);
      closePage(page);
      return;
  }
}

function closePage(page: Page): void {
  const contents = page.view.webContents;
  if (contents.isDestroyed()) return;
  const isolated = contents.session;
  contents.close();
  if (page.target.kind === 'public' && page.target.profileId !== undefined) return;
  void isolated
    .clearStorageData()
    .then(() => isolated.closeAllConnections())
    .catch((error: unknown) => {
      log.error('browser.cleanup_failed', error);
    });
}
