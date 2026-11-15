import { background, Logger } from '@smarteverything/logging';
import { BrowserWindow, session } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ringTitle } from './ring-copy.js';
import { ringPageEventOf, ringPageHtml, ringPageView } from './ring-page.js';
import type { RingSoundStore } from './ring-sounds.js';
import type { DesktopRing, RingChoice, RingSurface } from './ring-types.js';

const log = new Logger('desktop.planner-ring');
const PARTITION = 'smarteverything-planner-ring';
const WIDTH = 440;
const HEIGHT = 640;

function localDayOf(moment: Date): string {
  const month = String(moment.getMonth() + 1).padStart(2, '0');
  const date = String(moment.getDate()).padStart(2, '0');
  return `${String(moment.getFullYear())}-${month}-${date}`;
}

export interface RingWindowsOptions {
  readonly pages: string;
  readonly sounds: RingSoundStore;
}

function windowOf(ring: DesktopRing): BrowserWindow {
  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    title: ringTitle(ring),
    backgroundColor: '#0b0b0d',
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
  return window;
}

export class RingWindows implements RingSurface {
  readonly #options: RingWindowsOptions;
  readonly #windows = new Map<string, BrowserWindow>();
  readonly #ready: Promise<void>;

  constructor(options: RingWindowsOptions) {
    this.#options = options;
    this.#ready = rm(options.pages, { recursive: true, force: true }).then(async () => {
      await mkdir(options.pages, { recursive: true });
    });
  }

  show(ring: DesktopRing, failed: RingChoice | null, onChoice: (choice: RingChoice) => void): void {
    if (this.#windows.has(ring.ringKey)) return;
    const window = windowOf(ring);
    const page = join(
      this.#options.pages,
      `${createHash('sha256').update(ring.ringKey).digest('hex')}.html`,
    );
    window.webContents.on('page-title-updated', (event, title) => {
      event.preventDefault();
      const happened = ringPageEventOf(title);
      if (happened === 'sound-failed') {
        log.warn('planner_ring.sound_failed', { kind: ring.kind, sound: ring.sound.kind });
      } else if (happened !== null) {
        onChoice(happened);
      }
    });
    window.on('close', (event) => {
      if (this.#windows.has(ring.ringKey) && ring.challenge.kind !== 'none') event.preventDefault();
    });
    window.on('closed', () => {
      background(rm(page, { force: true }), 'planner_ring.page_remove_failed');
      if (this.#windows.delete(ring.ringKey)) onChoice('dismiss');
    });
    this.#windows.set(ring.ringKey, window);
    background(this.#load(ring, failed, window, page), 'planner_ring.page_failed', {
      kind: ring.kind,
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

  async #load(
    ring: DesktopRing,
    failed: RingChoice | null,
    window: BrowserWindow,
    page: string,
  ): Promise<void> {
    try {
      const source = await this.#options.sounds.sourceOf(ring.sound);
      await this.#ready;
      await writeFile(
        page,
        ringPageHtml(ringPageView(ring, source, localDayOf(new Date()), failed)),
        'utf8',
      );
      if (window.isDestroyed()) return;
      await window.loadFile(page);
    } catch (cause) {
      log.error('planner_ring.page_failed', cause);
      this.close(ring.ringKey);
    }
  }
}
