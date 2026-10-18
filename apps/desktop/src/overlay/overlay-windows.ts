import { BrowserWindow } from 'electron';
import { Logger } from '@smarteverything/logging';
import { OVERLAY_PAGE_URL } from './overlay-assets-route.js';
import type { OverlayRole, OverlaySize } from './overlay-messages.js';
import type { Rect } from './overlay-placement.js';
import {
  protectsFromCapture,
  windowOptions,
  type OverlayResources,
  type OverlayWindowSpec,
} from './overlay-window-options.js';

const log = new Logger('desktop.overlay');

export interface OverlayWindow {
  readonly role: OverlayRole;
  readonly senderId: number;
  show(): void;
  hide(): void;
  isVisible(): boolean;
  setBounds(bounds: Rect): void;
  setSize(size: OverlaySize): void;
  setTitle(title: string): void;
  setFocusable(focusable: boolean): void;
  setClickThrough(through: boolean): void;
  focus(): void;
  send(channel: string, payload: unknown): void;
  destroy(): void;
  isDestroyed(): boolean;
  onClosed(listener: () => void): void;
}

export type OverlayWindowFactory = (spec: OverlayWindowSpec) => OverlayWindow;

function hardenContents(window: BrowserWindow): void {
  const { webContents } = window;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  window.on('page-title-updated', (event) => {
    event.preventDefault();
  });
}

function wrap(role: OverlayRole, window: BrowserWindow): OverlayWindow {
  return {
    role,
    senderId: window.webContents.id,
    show: (): void => {
      window.showInactive();
    },
    hide: (): void => {
      window.hide();
    },
    isVisible: (): boolean => window.isVisible(),
    setBounds: (bounds): void => {
      window.setBounds(bounds);
    },
    setSize: (size): void => {
      window.setSize(size.width, size.height);
    },
    setTitle: (title): void => {
      window.setTitle(title);
    },
    setFocusable: (focusable): void => {
      window.setFocusable(focusable);
    },
    setClickThrough: (through): void => {
      window.setIgnoreMouseEvents(through);
    },
    focus: (): void => {
      window.focus();
    },
    send: (channel, payload): void => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, payload);
      }
    },
    destroy: (): void => {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    },
    isDestroyed: (): boolean => window.isDestroyed(),
    onClosed: (listener): void => {
      window.once('closed', listener);
    },
  };
}

export function createOverlayWindowFactory(resources: OverlayResources): OverlayWindowFactory {
  return (spec) => {
    const window = new BrowserWindow(windowOptions(spec, resources));
    hardenContents(window);
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (spec.role === 'glow') {
      window.setIgnoreMouseEvents(true);
    }
    if (protectsFromCapture(spec.platform)) {
      window.setContentProtection(true);
    }
    window.webContents.on('console-message', (details) => {
      if (details.level === 'error') {
        log.error('overlay.page_error', undefined, { role: spec.role, message: details.message });
      }
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      log.error('overlay.renderer_gone', undefined, { role: spec.role, reason: details.reason });
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
    window.loadURL(OVERLAY_PAGE_URL).catch((error: unknown) => {
      log.error('overlay.load_failed', error, { role: spec.role });
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
    log.debug('overlay.window_created', { role: spec.role });
    return wrap(spec.role, window);
  };
}
