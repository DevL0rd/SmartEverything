import type { DesktopCaptureMode, DesktopCaptureSource } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Bridge {
  mode: DesktopCaptureMode;
  chosen: (string | null)[];
}

const bridge = vi.hoisted((): Bridge => ({ mode: 'picker', chosen: [] }));

function source(
  id: string,
  kind: 'screen' | 'window',
  title: string,
  primary = false,
): DesktopCaptureSource {
  return { id, kind, title, thumbnail: null, appIcon: null, primary, width: null, height: null };
}

const SOURCES: readonly DesktopCaptureSource[] = [
  source('screen:1:0', 'screen', 'Screen 2'),
  source('screen:0:0', 'screen', 'Screen 1', true),
  source('window:7:0', 'window', 'Terminal'),
];

vi.mock('../../../../../design/platform', () => ({
  desktopBridge: (): object => ({
    captureMode: (): Promise<DesktopCaptureMode> => Promise.resolve(bridge.mode),
    listCaptureSources: (): Promise<readonly DesktopCaptureSource[]> => Promise.resolve(SOURCES),
    chooseCaptureSource: (id: string | null): Promise<void> => {
      bridge.chosen.push(id);
      return Promise.resolve();
    },
  }),
}));

const { chooseDesktopSource } = await import('./desktop-choice');

beforeEach(() => {
  bridge.mode = 'picker';
  bridge.chosen = [];
});

describe('choosing what the desktop app captures', () => {
  it('picks the primary screen when no screen is named', async () => {
    await chooseDesktopSource('desktop_screen', null);
    expect(bridge.chosen).toEqual(['screen:0:0']);
  });

  it('finds a window by part of its title', async () => {
    await chooseDesktopSource('desktop_window', 'term');
    expect(bridge.chosen).toEqual(['window:7:0']);
  });

  it('refuses a window that is not named or not open', async () => {
    await expect(chooseDesktopSource('desktop_window', null)).rejects.toThrow('Say which window');
    await expect(chooseDesktopSource('desktop_window', 'mail')).rejects.toThrow('No open window');
    expect(bridge.chosen).toEqual([]);
  });

  it('leaves the choice to the system dialog outside the in-app picker mode', async () => {
    bridge.mode = 'portal';
    await chooseDesktopSource('desktop_screen', null);
    expect(bridge.chosen).toEqual([]);
  });
});
