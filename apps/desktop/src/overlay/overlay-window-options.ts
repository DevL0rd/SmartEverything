import path from 'node:path';
import type { BrowserWindowConstructorOptions } from 'electron';
import { OVERLAY_ROLE_ARGUMENT, type OverlayRole, type OverlaySize } from './overlay-messages.js';

export interface OverlayWindowSpec {
  readonly role: OverlayRole;
  readonly size: OverlaySize;
  readonly title: string;
  readonly platform: NodeJS.Platform;
}

export interface OverlayResources {
  readonly preload: string;
}

export function windowOptions(
  spec: OverlayWindowSpec,
  resources: OverlayResources,
): BrowserWindowConstructorOptions {
  return {
    width: spec.size.width,
    height: spec.size.height,
    minWidth: 1,
    minHeight: 1,
    resizable: true,
    show: false,
    title: spec.title,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    ...(spec.platform === 'darwin' ? { type: 'panel' } : {}),
    ...(spec.platform === 'linux' ? { type: 'notification' } : {}),
    webPreferences: {
      preload: path.resolve(resources.preload),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false,
      additionalArguments: [`${OVERLAY_ROLE_ARGUMENT}${spec.role}`],
    },
  };
}

export function protectsFromCapture(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'darwin';
}
