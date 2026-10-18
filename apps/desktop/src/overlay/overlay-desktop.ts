import path from 'node:path';
import { app, screen, type BrowserWindow, type Display } from 'electron';
import type {
  DesktopOverlayHelper,
  DesktopTalkCommand,
  OverlayAction,
  OverlayHostView,
} from '@smarteverything/domain';
import type { MenuItemConstructorOptions } from 'electron';
import { Logger } from '@smarteverything/logging';
import type { DesktopTray } from '../tray.js';
import { SessionKwin } from './kwin-overlay.js';
import { installKwinScript } from './kwin-script-file.js';
import { helperStatus } from './overlay-helper.js';
import { OverlayController } from './overlay-controller.js';
import type { DisplayHints, DisplayInfo } from './overlay-placement.js';
import { serveOverlayAssets } from './overlay-protocol.js';
import { filePositionStore } from './overlay-position.js';
import { overlayMenuItems, overlayMenuSignature } from './overlay-tray-menu.js';
import { createOverlayWindowFactory } from './overlay-windows.js';

const log = new Logger('desktop.overlay');

const OVERLAY_ACTION_CHANNEL = 'desktop:overlay-action';
const OVERLAY_HOLD_CHANNEL = 'desktop:overlay-hold';
const OVERLAY_HELPER_CHANNEL = 'desktop:overlay-helper';

const PAGE_DIRECTORY = 'overlay';

function displayInfo(display: Display, primaryId: number): DisplayInfo {
  return {
    id: display.id,
    origin: { x: display.bounds.x, y: display.bounds.y },
    workArea: display.workArea,
    scale: display.scaleFactor,
    primary: display.id === primaryId,
  };
}

export class OverlayDesktop {
  readonly #controller: OverlayController;
  readonly #assets: string;
  #window: BrowserWindow | null = null;
  #tray: DesktopTray | null = null;
  #view: OverlayHostView | null = null;

  constructor(distDirectory: string) {
    const directory = path.join(distDirectory, PAGE_DIRECTORY);
    this.#assets = directory;
    this.#controller = new OverlayController({
      platform: process.platform,
      createWindow: createOverlayWindowFactory({
        preload: path.join(directory, 'overlay-preload.cjs'),
      }),
      kwin:
        process.platform === 'linux'
          ? new SessionKwin(() =>
              installKwinScript(
                path.join(directory, 'overlay-kwin.js'),
                path.join(app.getPath('userData'), PAGE_DIRECTORY),
              ),
            )
          : null,
      displays: (): readonly DisplayInfo[] => {
        const primaryId = screen.getPrimaryDisplay().id;
        return screen.getAllDisplays().map((display) => displayInfo(display, primaryId));
      },
      hints: (): DisplayHints => ({
        cursor: screen.getCursorScreenPoint(),
        appWindow: this.#window?.isDestroyed() === false ? this.#window.getBounds() : null,
      }),
      gpu: (): boolean => app.getGPUFeatureStatus().gpu_compositing.startsWith('enabled'),
      deliver: (action): void => {
        this.#toMain(OVERLAY_ACTION_CHANNEL, action);
      },
      hold: (active): void => {
        this.#toMain(OVERLAY_HOLD_CHANNEL, active);
      },
      helperChanged: (helper): void => {
        this.#toMain(OVERLAY_HELPER_CHANNEL, helperStatus(helper));
      },
      position: filePositionStore(
        path.join(app.getPath('userData'), PAGE_DIRECTORY, 'position.json'),
      ),
      positionChanged: (): void => {
        this.#tray?.refresh();
      },
    });
  }

  serve(): void {
    serveOverlayAssets(this.#assets);
  }

  get controller(): OverlayController {
    return this.#controller;
  }

  attach(window: BrowserWindow, tray: DesktopTray): void {
    this.#window = window;
    this.#tray = tray;
    const refresh = (): void => {
      this.#controller.displaysChanged();
    };
    screen.on('display-added', refresh);
    screen.on('display-removed', refresh);
    screen.on('display-metrics-changed', refresh);
  }

  setView(view: OverlayHostView): Promise<void> {
    const stale = overlayMenuSignature(view) === overlayMenuSignature(this.#view);
    this.#view = view;
    if (!stale) {
      this.#tray?.refresh();
    }
    return this.#controller.setView(view);
  }

  menuItems(): MenuItemConstructorOptions[] {
    return overlayMenuItems(
      this.#view,
      (action) => {
        this.act(action);
      },
      this.#controller.moved
        ? (): void => {
            this.#controller.resetPosition();
          }
        : null,
    );
  }

  helper(): DesktopOverlayHelper {
    return helperStatus(this.#controller.helper());
  }

  takesShortcut(command: DesktopTalkCommand): boolean {
    if (command.kind !== 'assistant' || !this.#controller.hasRequest()) {
      return false;
    }
    if (command.phase !== 'release') {
      this.#controller.focusRequest();
    }
    return true;
  }

  act(action: OverlayAction): void {
    this.#toMain(OVERLAY_ACTION_CHANNEL, action);
  }

  async stop(): Promise<void> {
    try {
      await this.#controller.close();
    } catch (cause) {
      log.error('overlay.close_failed', cause);
    }
  }

  #toMain(channel: string, payload: unknown): void {
    const window = this.#window;
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}
