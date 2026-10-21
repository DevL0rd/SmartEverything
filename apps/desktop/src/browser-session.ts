import { desktopHtml } from './html-preview/projections.js';
import { Logger } from '@smarteverything/logging';
import { randomUUID } from 'node:crypto';
import { WebContentsView, session, shell, type Session, type WebContents } from 'electron';
import {
  BrowserPolicyError,
  browsableUrl,
  browserAllows,
  publicBrowserUrl,
  type BrowserTarget,
} from '@smarteverything/domain';
import { popupDecision } from './browser-popup.js';

const log = new Logger('desktop.browser-session');
const CLIPBOARD_WRITE = 'clipboard-sanitized-write';
const targets = new Map<number, BrowserTarget>();
const configured = new WeakSet<Session>();
export function createBrowserView(target: BrowserTarget, owner: number): WebContentsView {
  const isolated = browserSession(target);
  configureSession(isolated);
  const view = new WebContentsView({
    webPreferences: {
      session: isolated,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      navigateOnDragDrop: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });
  const contentsId = view.webContents.id;
  targets.set(contentsId, target);
  log.info('browser.view_created', { contentsId, kind: target.kind, owner });
  view.webContents.once('destroyed', () => {
    targets.delete(contentsId);
    log.debug('browser.view_destroyed', { contentsId, open: targets.size });
  });
  if (target.kind === 'project') {
    const projection = desktopHtml();
    if (projection === null) {
      log.warn('browser.projection_missing', { contentsId, kind: target.kind });
      view.webContents.close();
      throw new BrowserPolicyError('This page can’t open here. Update the desktop app.');
    }
    projection.attach(owner, target, isolated, view.webContents);
  }
  view.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  return view;
}
export function confineBrowserView(
  contents: WebContents,
  target: BrowserTarget,
  reactions: {
    readonly blocked: (problem: string) => void;
    readonly openTab: (url: string) => void;
  },
): void {
  const { blocked, openTab } = reactions;
  const refuse = (event: { preventDefault: () => void }, url: string): void => {
    if (browserAllows(target, url)) return;
    log.warn('browser.navigation_refused', { kind: target.kind });
    event.preventDefault();
    blocked('This page can’t open that address.');
  };
  contents.setWindowOpenHandler(({ url }) => {
    const decision = popupDecision(target, url);
    log.debug('browser.popup_decided', { decision, kind: target.kind });
    if (decision === 'open-tab') openTab(url);
    else if (decision === 'load-here')
      contents.loadURL(url).catch((cause: unknown) => {
        log.error('browser.popup_load_failed', cause);
        blocked('The page could not be loaded.');
      });
    else if (decision === 'open-externally')
      shell.openExternal(url).catch((cause: unknown) => {
        log.error('browser.open_external_failed', cause);
        blocked('The address could not be opened in your browser.');
      });
    else blocked('This page can’t open that address.');
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    refuse(event, url);
  });
  contents.on('will-redirect', (event, url) => {
    refuse(event, url);
  });
}
function configureSession(isolated: Session): void {
  if (configured.has(isolated)) return;
  isolated.setPermissionRequestHandler((_contents, permission, answer) => {
    answer(permission === CLIPBOARD_WRITE);
  });
  isolated.setPermissionCheckHandler((_contents, permission) => permission === CLIPBOARD_WRITE);
  isolated.setDevicePermissionHandler(() => false);
  isolated.webRequest.onBeforeRequest((details, answer) => {
    const target =
      details.webContentsId === undefined ? undefined : targets.get(details.webContentsId);
    const value = details.url.replace(/^wss:/, 'https:');
    const inline =
      target?.kind === 'project' &&
      ['data:', 'blob:'].some((scheme) => value.startsWith(scheme));
    const external =
      target?.kind === 'project' &&
      details.resourceType !== 'mainFrame' &&
      publicBrowserUrl(value);
    answer({
      cancel:
        target === undefined
          ? !browsableUrl(value)
          : !inline && !external && !browserAllows(target, value),
    });
  });
  configured.add(isolated);
}
function browserSession(target: BrowserTarget): Session {
  const partition =
    target.kind === 'public' && target.profileId !== undefined
      ? `persist:smarteverything-public-${target.profileId}`
      : `browser-${target.kind}-${randomUUID()}`;
  return session.fromPartition(partition);
}
