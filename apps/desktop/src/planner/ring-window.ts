import { Logger } from '@smarteverything/logging';
import { BrowserWindow, session } from 'electron';
import { ringTitle } from './ring-copy.js';
import { choiceOfTitle, ringPageUrl } from './ring-page.js';
import type { DesktopRing, RingChoice, RingSurface } from './ring-types.js';

const log = new Logger('desktop.planner-ring');
const PARTITION = 'smarteverything-planner-ring';
const WIDTH = 420;
const HEIGHT = 320;

export class RingWindows implements RingSurface {
  readonly #windows = new Map<string, BrowserWindow>();

  show(ring: DesktopRing, onChoice: (choice: RingChoice) => void): void {
    if (this.#windows.has(ring.ringKey)) return;
    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      title: ringTitle(ring),
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      center: true,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        autoplayPolicy: 'no-user-gesture-required',
        session: session.fromPartition(PARTITION),
      },
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });
    window.webContents.on('page-title-updated', (_event, title) => {
      const choice = choiceOfTitle(title);
      if (choice !== null) onChoice(choice);
    });
    window.on('closed', () => {
      if (this.#windows.delete(ring.ringKey)) onChoice('dismiss');
    });
    this.#windows.set(ring.ringKey, window);
    window.loadURL(ringPageUrl(ring)).catch((cause: unknown) => {
      log.error('planner_ring.page_failed', cause);
      this.close(ring.ringKey);
    });
  }

  focus(ringKey: string): void {
    const window = this.#windows.get(ringKey);
    if (window === undefined || window.isDestroyed()) return;
    window.show();
    window.focus();
  }

  close(ringKey: string): void {
    const window = this.#windows.get(ringKey);
    this.#windows.delete(ringKey);
    if (window !== undefined && !window.isDestroyed()) window.close();
  }
}
