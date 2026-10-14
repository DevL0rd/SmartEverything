import { ipcMain, type BrowserWindow } from 'electron';
import { BrowserPolicyError, NATIVE_HTML_ID } from '@smarteverything/domain';
import { desktopHtml } from './projections.js';
import { isAppOrigin } from '../origin.js';

export function registerHtmlPreviewIpc(window: BrowserWindow, startUrl: string): void {
  let epoch = 0;
  const valid = (): boolean =>
    !window.isDestroyed() && isAppOrigin(window.webContents.getURL(), startUrl);
  supportHtml(window, valid);
  ipcMain.handle('desktop:html-open', async (event, value: unknown) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !valid()
    )
      throw new BrowserPolicyError('HTML claims require the app main frame.');
    const projection = desktopHtml();
    if (projection === null) throw new BrowserPolicyError('Native HTML projection is unavailable.');
    const current = epoch;
    const result = await projection.open(event.sender.id, value);
    if (current !== epoch || !valid()) {
      projection.release(event.sender.id, result.id);
      throw new BrowserPolicyError('HTML owner changed during admission.');
    }
    return result;
  });
  ipcMain.handle('desktop:html-release', (event, value: unknown) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !valid()
    )
      throw new BrowserPolicyError('HTML release requires the app main frame.');
    desktopHtml()?.release(event.sender.id, NATIVE_HTML_ID.parse(value));
  });
  const retire = (): void => {
    epoch += 1;
    desktopHtml()?.closeOwner(window.webContents.id);
  };
  window.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) retire();
  });
  window.once('closed', () => {
    retire();
    ipcMain.removeHandler('desktop:html-open');
    ipcMain.removeHandler('desktop:html-release');
    ipcMain.removeAllListeners('desktop:html-supported');
    ipcMain.removeAllListeners('desktop:html-lifetime-version');
    ipcMain.removeAllListeners('desktop:html-project-version');
  });
}

function supportHtml(window: BrowserWindow, valid: () => boolean): void {
  ipcMain.on('desktop:html-project-version', (event) => {
    const response = event;
    response.returnValue =
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      valid() &&
      desktopHtml() !== null
        ? 1
        : 0;
  });
  ipcMain.on('desktop:html-lifetime-version', (event) => {
    const response = event;
    response.returnValue =
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      valid() &&
      desktopHtml() !== null
        ? 2
        : 0;
  });
  ipcMain.on('desktop:html-supported', (event) => {
    const response = event;
    response.returnValue =
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      valid() &&
      desktopHtml() !== null;
  });
}
