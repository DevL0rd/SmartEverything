import type { BrowserWindowConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { windowOptions, protectsFromCapture } from '../src/overlay/overlay-window-options.js';

const RESOURCES = { preload: '/app/overlay-preload.cjs' };

function options(
  role: 'glow' | 'pill' | 'tray',
  platform: NodeJS.Platform = 'linux',
): BrowserWindowConstructorOptions {
  return windowOptions(
    { role, size: { width: 400, height: 120 }, title: 'caption', platform },
    RESOURCES,
  );
}

describe('overlay window options', () => {
  it('lets every window resize down to one pixel so KWin can fit it', () => {
    for (const role of ['glow', 'pill', 'tray'] as const) {
      const window = options(role);
      expect(window.resizable).toBe(true);
      expect(window.minWidth).toBe(1);
      expect(window.minHeight).toBe(1);
    }
  });

  it('never takes focus, shows no frame and stays out of the task switcher', () => {
    for (const role of ['glow', 'pill', 'tray'] as const) {
      const window = options(role);
      expect(window).toMatchObject({
        focusable: false,
        frame: false,
        transparent: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        hasShadow: false,
        title: 'caption',
      });
      expect(window.webPreferences).toMatchObject({
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        additionalArguments: [`--overlay-role=${role}`],
      });
    }
  });

  it('uses the panel type on macOS and the notification type on Linux', () => {
    expect(options('pill', 'darwin').type).toBe('panel');
    expect(options('pill', 'linux').type).toBe('notification');
    expect(options('pill', 'win32').type).toBeUndefined();
  });

  it('protects from capture on Windows and macOS only', () => {
    expect(protectsFromCapture('win32')).toBe(true);
    expect(protectsFromCapture('darwin')).toBe(true);
    expect(protectsFromCapture('linux')).toBe(false);
  });
});
