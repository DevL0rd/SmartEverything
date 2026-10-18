import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type { BrowserWindowConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { OVERLAY_ROLES } from '../src/overlay/overlay-messages.js';
import { captionOf } from '../src/overlay/overlay-placement.js';
import { windowOptions } from '../src/overlay/overlay-window-options.js';

const OVERLAY_DIRECTORY = path.join(import.meta.dirname, '../src/overlay');
const SCRIPT = readFileSync(path.join(OVERLAY_DIRECTORY, 'kwin/overlay.js'), 'utf8');
const RESOURCES = { preload: '/app/overlay-preload.cjs' };
const SPECIAL_TYPES = [
  'desktop',
  'dock',
  'toolbar',
  'splash',
  'utility',
  'notification',
  'tooltip',
] as const;

interface SeenWindow {
  readonly type: string;
  readonly skipTaskbar: boolean;
}

function konveyorManages(window: SeenWindow): boolean {
  if (SPECIAL_TYPES.some((special) => special === window.type) || window.skipTaskbar) {
    return false;
  }
  return window.type === 'normal' || window.type === 'dialog';
}

function options(
  role: (typeof OVERLAY_ROLES)[number],
  platform: NodeJS.Platform,
): BrowserWindowConstructorOptions {
  return windowOptions(
    { role, size: { width: 400, height: 120 }, title: 'caption', platform },
    RESOURCES,
  );
}

class Signal {
  readonly handlers: (() => void)[] = [];
  connect(handler: () => void): void {
    this.handlers.push(handler);
  }
}

class ScriptedWindow {
  skipTaskbar = false;
  readonly captionChanged = new Signal();
  readonly frameGeometryChanged = new Signal();
  readonly fullScreenChanged = new Signal();
  readonly interactiveMoveResizeStarted = new Signal();
  readonly interactiveMoveResizeFinished = new Signal();
  readonly fullScreen = false;
  readonly output = { name: 'X' };
  frameGeometry = { x: 0, y: 0, width: 300, height: 80 };
  constructor(readonly caption: string) {}
}

function windowAfterScript(caption: string): ScriptedWindow {
  const handlers: ((window: ScriptedWindow) => void)[] = [];
  const workspace = {
    screens: [],
    activeScreen: { name: 'X' },
    currentDesktop: 'd',
    activeWindow: null,
    windowAdded: {
      connect: (handler: (window: ScriptedWindow) => void): void => {
        handlers.push(handler);
      },
    },
    windowList: (): ScriptedWindow[] => [],
    windowRemoved: { connect: (): void => undefined },
    clientArea: (): object => ({ x: 0, y: 0, width: 1000, height: 1000 }),
  };
  vm.runInNewContext(SCRIPT, {
    workspace,
    KWin: { PlacementArea: 0 },
    callDBus: (): void => undefined,
  });
  const window = new ScriptedWindow(caption);
  handlers.forEach((handler) => {
    handler(window);
  });
  return window;
}

describe('overlay windows against the Konveyor tiling check', () => {
  it('are not managed on X11, where the window type and skip-taskbar travel with the window', () => {
    for (const role of OVERLAY_ROLES) {
      const built = options(role, 'linux');
      expect(built.type).toBe('notification');
      expect(
        konveyorManages({ type: built.type ?? 'normal', skipTaskbar: built.skipTaskbar === true }),
      ).toBe(false);
      expect(konveyorManages({ type: 'normal', skipTaskbar: built.skipTaskbar === true })).toBe(
        false,
      );
    }
  });

  it('are not managed on Wayland, where the type is ignored and the script flags them when the window is added', () => {
    for (const role of OVERLAY_ROLES) {
      const caption = captionOf({
        role,
        anchor: 'bottom-centre',
        output: 'active',
        focus: false,
        inset: 0,
      });
      const window = windowAfterScript(caption);
      expect(konveyorManages({ type: 'normal', skipTaskbar: window.skipTaskbar })).toBe(false);
    }
  });

  it('would be managed on Wayland without the script, so the window title must stay the script key', () => {
    const plain = windowAfterScript('SmartEverything');
    expect(konveyorManages({ type: 'normal', skipTaskbar: plain.skipTaskbar })).toBe(true);
  });

  it('always carry the options that keep them out of the task list and focus', () => {
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      for (const role of OVERLAY_ROLES) {
        expect(options(role, platform)).toMatchObject({
          skipTaskbar: true,
          focusable: false,
          alwaysOnTop: true,
          frame: false,
          transparent: true,
          show: false,
        });
      }
    }
  });

  it('create every overlay window through the shared options and nowhere else in the overlay code', () => {
    const creators = readdirSync(OVERLAY_DIRECTORY)
      .filter((name) => name.endsWith('.ts'))
      .filter((name) =>
        readFileSync(path.join(OVERLAY_DIRECTORY, name), 'utf8').includes('new BrowserWindow('),
      );
    expect(creators).toEqual(['overlay-windows.ts']);
    const source = readFileSync(path.join(OVERLAY_DIRECTORY, 'overlay-windows.ts'), 'utf8');
    expect(source).toContain('new BrowserWindow(windowOptions(spec, resources))');
  });
});
