import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeImage {
  readonly file: string;
  readonly isEmpty: () => boolean;
  readonly getSize: () => { width: number; height: number };
  readonly toBitmap: () => Buffer;
}

const theme = {
  shouldUseDarkColors: true,
  shouldUseDarkColorsForSystemIntegratedUI: false,
  listeners: new Set<() => void>(),
  on(_event: string, listener: () => void): void {
    this.listeners.add(listener);
  },
  removeListener(_event: string, listener: () => void): void {
    this.listeners.delete(listener);
  },
};

const shown: string[] = [];

function image(file: string): FakeImage {
  return {
    file,
    isEmpty: () => !existsSync(file),
    getSize: () => ({ width: 22, height: 22 }),
    toBitmap: () => Buffer.alloc(22 * 22 * 4),
  };
}

vi.mock('electron', () => ({
  nativeTheme: theme,
  nativeImage: {
    createFromPath: (file: string): FakeImage => image(file),
    createFromBitmap: (): FakeImage => image('bitmap'),
  },
  Tray: class {
    constructor(first: FakeImage) {
      shown.push(path.basename(first.file));
    }
    setImage(next: FakeImage): void {
      shown.push(path.basename(next.file));
    }
  },
}));

const { themedTray, trayImages, trayTone, trayToneFile } = await import('../src/tray-icon.js');

const ICONS = path.resolve(import.meta.dirname, '..', 'assets', 'tray');

function named(loaded: object): string {
  const file: unknown = Reflect.get(loaded, 'file');
  return typeof file === 'string' ? path.basename(file) : '';
}

describe('tray icon', () => {
  beforeEach(() => {
    shown.length = 0;
    theme.listeners.clear();
    theme.shouldUseDarkColors = true;
    theme.shouldUseDarkColorsForSystemIntegratedUI = false;
  });

  it('uses the white glyph on dark themes and the black glyph on light themes', () => {
    expect(trayTone('linux', { ...theme, shouldUseDarkColors: true })).toBe('white');
    expect(trayTone('linux', { ...theme, shouldUseDarkColors: false })).toBe('black');
  });

  it('follows the Windows taskbar colour rather than the app colour', () => {
    expect(
      trayTone('win32', {
        shouldUseDarkColors: false,
        shouldUseDarkColorsForSystemIntegratedUI: true,
      }),
    ).toBe('white');
    expect(trayToneFile('win32', 'white')).toBe('tray-white.ico');
    expect(trayToneFile('linux', 'black')).toBe('tray-black.png');
  });

  it('ships every glyph it can choose', () => {
    for (const platform of ['linux', 'win32', 'darwin'] as const) {
      for (const tone of ['white', 'black'] as const) {
        expect(existsSync(path.join(ICONS, trayToneFile(platform, tone)))).toBe(true);
      }
    }
    expect(existsSync(path.join(ICONS, 'tray-white@2x.png'))).toBe(true);
    expect(existsSync(path.join(ICONS, 'trayTemplate@2x.png'))).toBe(true);
  });

  it('shows the macOS template image while idle', () => {
    expect(named(trayImages(ICONS, 'darwin').idle)).toBe('trayTemplate.png');
  });

  it('swaps the glyph when the system theme changes and stops following once stopped', () => {
    const icon = themedTray(ICONS, 'linux');
    theme.shouldUseDarkColors = false;
    for (const listener of theme.listeners) listener();
    expect(shown).toEqual(['tray-white.png', 'tray-black.png']);
    icon.stop();
    expect(theme.listeners.size).toBe(0);
  });

  it('fails loudly when a glyph is missing', () => {
    expect(() => trayImages(path.join(ICONS, 'missing'), 'linux')).toThrow(/tray-white\.png/);
  });
});
