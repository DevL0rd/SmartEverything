import { Logger } from '@smarteverything/logging';
import { BrowserWindow, session } from 'electron';
import type { RingPort } from './agent-actions.js';
import { RING_STOP_TITLE, ringPageUrl } from './ring-page.js';

const log = new Logger('desktop.agent');
const PARTITION = 'smarteverything-ring';
const WIDTH = 440;
const HEIGHT = 300;

export class RingWindow implements RingPort {
  #window: BrowserWindow | null = null;
  readonly #ended = new Set<() => void>();

  start(ended: () => void): void {
    this.#ended.add(ended);
    if (this.#window !== null) return;
    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      title: 'SmartEverything is ringing',
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
      if (title === RING_STOP_TITLE) this.stop();
    });
    window.on('closed', () => {
      this.#window = null;
      this.#finish();
    });
    this.#window = window;
    window.loadURL(ringPageUrl()).catch((cause: unknown) => {
      log.error('agent.ring_page_failed', cause);
      this.stop();
    });
    log.info('agent.ring_started', {});
  }

  stop(): void {
    const window = this.#window;
    if (window === null || window.isDestroyed()) {
      this.#window = null;
      this.#finish();
      return;
    }
    window.close();
  }

  #finish(): void {
    const ended = [...this.#ended];
    this.#ended.clear();
    for (const done of ended) done();
    log.info('agent.ring_ended', { listeners: ended.length });
  }
}
