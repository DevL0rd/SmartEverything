import { describe, expect, it } from 'vitest';
import type { DesktopStill } from '@smarteverything/domain';
import {
  electronAgentActions,
  type ElectronActionsOptions,
} from '../../src/agent/agent-actions.js';

const STILL: DesktopStill = {
  sourceId: 'screen:0:0',
  kind: 'screen',
  title: 'Screen 1',
  width: 1280,
  height: 720,
  mime: 'image/jpeg',
  dataBase64: 'AAAA',
};

function options(
  path = '',
  screenRecording: boolean | null = null,
): { readonly options: ElectronActionsOptions; readonly seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    options: {
      shell: {
        openExternal: (url): Promise<void> => {
          seen.push(`external ${url}`);
          return Promise.resolve();
        },
        openPath: (target): Promise<string> => {
          seen.push(`path ${target}`);
          return Promise.resolve(path);
        },
      },
      ring: {
        start: (): void => {
          seen.push('ring start');
        },
        stop: (): void => {
          seen.push('ring stop');
        },
      },
      screen: {
        still: (source): Promise<DesktopStill> => {
          seen.push(`still ${String(source)}`);
          return Promise.resolve(STILL);
        },
      },
      access: { screenRecording: (): boolean | null => screenRecording },
      now: (): Date => new Date('2026-10-18T10:00:00.000Z'),
    },
  };
}

describe('the desktop app actions', () => {
  it('opens a link with the system browser and a file with its default app', async () => {
    const { options: set, seen } = options();
    const actions = electronAgentActions(set);
    await actions.open({ kind: 'url', url: 'https://example.com/a' });
    await actions.open({ kind: 'path', path: '/home/me/a.pdf' });
    expect(seen).toEqual(['external https://example.com/a', 'path /home/me/a.pdf']);
  });

  it('fails with the operating system’s own words when it cannot open a file', async () => {
    const { options: set } = options('Failed to open path');
    await expect(
      electronAgentActions(set).open({ kind: 'path', path: '/missing' }),
    ).rejects.toMatchObject({ code: 'failed', message: 'Failed to open path' });
  });

  it('starts and stops the ring window', async () => {
    const { options: set, seen } = options();
    const actions = electronAgentActions(set);
    await actions.ring(true, () => undefined);
    await actions.ring(false, () => undefined);
    expect(seen).toEqual(['ring start', 'ring stop']);
  });

  it('captures the whole screen as a computer capture', async () => {
    const { options: set, seen } = options();
    await expect(electronAgentActions(set).capture('screen')).resolves.toEqual({
      mimeType: 'image/jpeg',
      data: 'AAAA',
      width: 1280,
      height: 720,
      at: '2026-10-18T10:00:00.000Z',
    });
    expect(seen).toEqual(['still null']);
  });

  it('says plainly that it cannot capture one window', async () => {
    const { options: set, seen } = options();
    await expect(electronAgentActions(set).capture('focused')).rejects.toMatchObject({
      code: 'not_supported',
    });
    expect(seen).toEqual([]);
  });

  it('reports Screen Recording on a Mac and nothing elsewhere', () => {
    expect(electronAgentActions(options('', false).options).permissions()).toEqual([
      { permission: 'mac_screen_recording', granted: false },
    ]);
    expect(electronAgentActions(options('', true).options).permissions()).toEqual([
      { permission: 'mac_screen_recording', granted: true },
    ]);
    expect(electronAgentActions(options().options).permissions()).toEqual([]);
  });
});
