import { desktopHtml } from './html-preview/projections.js';
import { BrowserPolicyError } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { WebContentsView, session, type Session } from 'electron';
import { browserAllows, publicBrowserUrl, type BrowserTarget } from '@smarteverything/domain';

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
  view.webContents.once('destroyed', () => {
    targets.delete(contentsId);
  });
  if (target.kind === 'native-html') {
    const projection = desktopHtml();
    if (projection === null) {
      view.webContents.close();
      throw new BrowserPolicyError('Native HTML projection is unavailable.');
    }
    projection.attach(owner, target, isolated, view.webContents);
  }
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  view.webContents.on('will-navigate', (event, url) => {
    if (!browserAllows(target, url)) event.preventDefault();
  });
  view.webContents.on('will-redirect', (event, url) => {
    if (!browserAllows(target, url)) event.preventDefault();
  });
  return view;
}
function configureSession(isolated: Session): void {
  if (configured.has(isolated)) return;
  isolated.setPermissionRequestHandler((_contents, _permission, answer) => {
    answer(false);
  });
  isolated.setPermissionCheckHandler(() => false);
  isolated.setDevicePermissionHandler(() => false);
  isolated.on('will-download', (event) => {
    event.preventDefault();
  });
  isolated.webRequest.onBeforeRequest((details, answer) => {
    const target =
      details.webContentsId === undefined ? undefined : targets.get(details.webContentsId);
    const value = details.url.replace(/^wss:/, 'https:');
    const inline =
      target?.kind === 'native-html' &&
      ['data:', 'blob:'].some((scheme) => value.startsWith(scheme));
    const external =
      target?.kind === 'native-html' &&
      details.resourceType !== 'mainFrame' &&
      publicBrowserUrl(value);
    answer({
      cancel:
        target === undefined
          ? !publicBrowserUrl(value)
          : !inline && !external && !browserAllows(target, value),
    });
  });
  configured.add(isolated);
}
function browserSession(target: BrowserTarget): Session {
  const partition =
    target.kind !== 'preview' && target.profileId !== undefined
      ? `persist:smarteverything-public-${target.profileId}`
      : `browser-${target.kind}-${randomUUID()}`;
  return session.fromPartition(partition);
}
