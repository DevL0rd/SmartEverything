import { desktopHtml } from './html-preview/projections.js';
import { BrowserPolicyError } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { WebContentsView, session } from 'electron';
import { browserAllows, type BrowserTarget } from '@smarteverything/domain';

export function createBrowserView(target: BrowserTarget, owner: number): WebContentsView {
  const isolated = browserSession(target);
  isolated.setPermissionRequestHandler((_contents, _permission, answer) => {
    answer(false);
  });
  isolated.setPermissionCheckHandler(() => false);
  isolated.setDevicePermissionHandler(() => false);
  isolated.on('will-download', (event) => {
    event.preventDefault();
  });
  isolated.webRequest.onBeforeRequest((details, answer) => {
    const value = details.url.replace(/^wss:/, 'https:');
    const inline =
      target.kind === 'native-html' &&
      ['data:', 'blob:'].some((scheme) => value.startsWith(scheme));
    answer({ cancel: !inline && !browserAllows(target, value) });
  });
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

function browserSession(target: BrowserTarget): Electron.Session {
  const partition =
    target.kind === 'public' && target.profileId !== undefined
      ? `persist:smarteverything-public-${target.profileId}`
      : `browser-${target.kind}-${randomUUID()}`;
  return session.fromPartition(partition);
}
