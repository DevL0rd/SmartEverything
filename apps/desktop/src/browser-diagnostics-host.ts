import type { BrowserWindow, WebContentsView } from 'electron';
import type { NativeBrowserDiagnostic } from '@smarteverything/domain';
import type { DiagnosticsHost } from './browser-diagnostics.js';

export class ElectronDiagnosticsHost implements DiagnosticsHost {
  constructor(
    private readonly window: BrowserWindow,
    private readonly view: WebContentsView,
  ) {}
  windowShown(): boolean {
    return !this.window.isDestroyed() && this.window.isVisible() && !this.window.isMinimized();
  }
  pageClosed(): boolean {
    return this.view.webContents.isDestroyed();
  }
  bounds(): { readonly width: number; readonly height: number } {
    return this.view.getBounds();
  }
  send(event: NativeBrowserDiagnostic): void {
    if (!this.window.isDestroyed())
      this.window.webContents.send('desktop:browser-diagnostic', event);
  }
  onNavigate(listener: () => void): void {
    this.view.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) listener();
    });
  }
  onConsole(listener: (level: string, message: string, source: string) => void): void {
    this.view.webContents.on('console-message', (details) => {
      listener(details.level, details.message, `${details.sourceId}:${String(details.lineNumber)}`);
    });
  }
  onWindowChange(listener: () => void): void {
    const window = this.window;
    window.on('show', listener);
    window.on('hide', listener);
    window.on('minimize', listener);
    window.on('restore', listener);
    this.view.webContents.once('destroyed', () => {
      window.removeListener('show', listener);
      window.removeListener('hide', listener);
      window.removeListener('minimize', listener);
      window.removeListener('restore', listener);
    });
  }
  onClosed(listener: () => void): void {
    this.view.webContents.once('destroyed', listener);
  }
  async clear(what: 'cache' | 'cookies' | 'storage'): Promise<void> {
    const contents = this.view.webContents;
    if (what === 'cache') {
      await contents.session.clearCache();
      return;
    }
    if (what === 'cookies') {
      await contents.session.clearStorageData({ storages: ['cookies'] });
      return;
    }
    await contents.session.clearStorageData();
    await contents.session.clearCache();
    await contents.executeJavaScript('sessionStorage.clear();localStorage.clear();');
  }
  async capturePng(): Promise<Buffer> {
    return (await this.view.webContents.capturePage()).toPNG();
  }
}
