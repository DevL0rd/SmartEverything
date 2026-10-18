import type { WindowRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { DesktopEntries } from '../../../src/node/controls/linux/desktop-entries';
import type { KdeWindow } from '../../../src/node/controls/linux/kde-bridge';
import { KdeWindows } from '../../../src/node/controls/linux/kde-windows';
import { LinuxWindows } from '../../../src/node/controls/linux/linux-windows';
import type { WindowProvider } from '../../../src/node/controls/linux/window-provider';
import {
  parseActive,
  parseWmctrl,
  WmctrlWindows,
} from '../../../src/node/controls/linux/wmctrl-windows';
import { fakeLines, installed, manualSchedule, recorder, settle } from './support';

const WMCTRL = `0x04200003  0 chrome.Google-chrome  desk Inbox - Mail
0x04600007  1 dolphin.dolphin  desk Home
0x00400004 -1 plasmashell.plasmashell  desk Desktop`;

describe('wmctrl windows', () => {
  it('parses windows, the desktop number, the app and the active window', () => {
    const rows = parseWmctrl(
      WMCTRL,
      parseActive('_NET_ACTIVE_WINDOW(WINDOW): window id # 0x4200003'),
    );
    expect(rows).toEqual([
      {
        id: '0x04200003',
        title: 'Inbox - Mail',
        app: { id: 'chrome.Google-chrome', name: 'Google-chrome' },
        desktop: '1',
        minimised: false,
        focused: true,
      },
      {
        id: '0x04600007',
        title: 'Home',
        app: { id: 'dolphin.dolphin', name: 'dolphin' },
        desktop: '2',
        minimised: false,
        focused: false,
      },
      {
        id: '0x00400004',
        title: 'Desktop',
        app: { id: 'plasmashell.plasmashell', name: 'plasmashell' },
        desktop: null,
        minimised: false,
        focused: false,
      },
    ]);
    expect(parseActive('nothing')).toBeNull();
  });

  it('focuses and closes through wmctrl, and says when a window is gone', async () => {
    const system = recorder({
      wmctrl: (args) => (args[0] === '-lx' ? WMCTRL : ''),
      xprop: 'window id # 0x4200003',
    });
    const windows = new WmctrlWindows(
      system.run,
      installed('wmctrl', 'xprop'),
      fakeLines().subscriber,
    );
    await expect(windows.act('0x04600007', 'focus')).resolves.toBe(true);
    await expect(windows.act('0x04600007', 'close')).resolves.toBe(true);
    await expect(windows.act('0x0badbad0', 'close')).resolves.toBe(false);
    expect(system.calls).toContain('wmctrl -i -a 0x04600007');
    expect(system.calls).toContain('wmctrl -i -c 0x04600007');
    expect(system.calls).not.toContain('wmctrl -i -c 0x0badbad0');
  });

  it('needs xdotool to minimise', async () => {
    const system = recorder({ wmctrl: WMCTRL, xdotool: '' });
    const without = new WmctrlWindows(system.run, installed('wmctrl'), fakeLines().subscriber);
    await expect(without.act('0x04200003', 'minimise')).rejects.toMatchObject({
      code: 'not_supported',
    });
    const withTool = new WmctrlWindows(
      system.run,
      installed('wmctrl', 'xdotool'),
      fakeLines().subscriber,
    );
    await withTool.act('0x04200003', 'minimise');
    expect(system.calls).toContain(`xdotool windowminimize ${String(0x4200003)}`);
  });

  it('listens to xprop for changes instead of polling', async () => {
    const lines = fakeLines();
    const changes: string[] = [];
    const stop = await new WmctrlWindows(recorder({}).run, installed(), lines.subscriber).watch(
      () => changes.push('changed'),
      () => undefined,
    );
    expect(lines.started[0]).toMatchObject({
      program: 'xprop',
      args: ['-root', '-spy', '_NET_CLIENT_LIST', '_NET_ACTIVE_WINDOW'],
    });
    lines.emit('_NET_CLIENT_LIST(WINDOW): window id # 0x1');
    expect(changes).toEqual(['changed']);
    stop();
    expect(lines.stopped).toHaveLength(1);
  });
});

describe('KDE windows', () => {
  it('maps KWin windows to rows with the desktop entry name', async () => {
    const bridge = {
      listWindows: (): Promise<KdeWindow[]> =>
        Promise.resolve([
          {
            id: '{a}',
            title: 'Home',
            desktopFile: 'org.kde.dolphin',
            resourceClass: 'dolphin',
            minimized: false,
            active: true,
            desktops: ['Desktop 1'],
          },
          {
            id: '{b}',
            title: 'Odd',
            desktopFile: '',
            resourceClass: 'xterm',
            minimized: true,
            active: false,
            desktops: [],
          },
          {
            id: '{c}',
            title: 'Bare',
            desktopFile: '',
            resourceClass: '',
            minimized: false,
            active: false,
            desktops: [],
          },
        ]),
      actOnWindow: (): Promise<boolean> => Promise.resolve(true),
      watchWindows: (): Promise<() => void> => Promise.resolve(() => undefined),
    };
    const rows = await new KdeWindows(() => bridge, new DesktopEntries()).list();
    expect(rows[0]).toMatchObject({
      id: '{a}',
      desktop: 'Desktop 1',
      focused: true,
      app: { id: 'org.kde.dolphin' },
    });
    expect(rows[1]).toEqual({
      id: '{b}',
      title: 'Odd',
      app: { id: 'xterm', name: 'xterm' },
      desktop: null,
      minimised: true,
      focused: false,
    });
    expect(rows[2]?.app).toBeNull();
  });
});

describe('LinuxWindows', () => {
  const ROW: WindowRow = {
    id: 'w1',
    title: 'One',
    app: null,
    desktop: null,
    minimised: false,
    focused: false,
  };

  function control(options: { kde: boolean; programs: string[]; rows?: WindowRow[] }): {
    windows: LinuxWindows;
    acted: string[];
    clock: ReturnType<typeof manualSchedule>;
    rows: WindowRow[];
    changed: () => void;
    watched: number[];
  } {
    const acted: string[] = [];
    const watched: number[] = [];
    const rows = options.rows ?? [ROW];
    let changed: () => void = () => undefined;
    const provider: WindowProvider = {
      list: () => Promise.resolve([...rows]),
      act: (id, action) => {
        acted.push(`${action} ${id}`);
        return Promise.resolve(id === 'w1');
      },
      watch: (onChange) => {
        changed = onChange;
        watched.push(1);
        return Promise.resolve(() => {
          watched.push(-1);
        });
      },
    };
    const clock = manualSchedule();
    return {
      windows: new LinuxWindows({
        kde: () => options.kde,
        probe: installed(...options.programs),
        kdeProvider: () => provider,
        x11Provider: () => provider,
        schedule: clock.schedule,
        failed: () => undefined,
      }),
      acted,
      clock,
      rows,
      changed: (): void => {
        changed();
      },
      watched,
    };
  }

  it('is a feature on KDE and with wmctrl, and unsupported otherwise', async () => {
    await expect(control({ kde: true, programs: [] }).windows.features()).resolves.toEqual([
      'windows',
    ]);
    await expect(control({ kde: false, programs: ['wmctrl'] }).windows.features()).resolves.toEqual(
      ['windows'],
    );
    const none = control({ kde: false, programs: [] }).windows;
    await expect(none.features()).resolves.toEqual([]);
    await expect(none.read()).rejects.toMatchObject({ code: 'not_supported' });
  });

  it('acts on a window and reports one that is already gone', async () => {
    const { windows, acted } = control({ kde: true, programs: [] });
    await expect(windows.change({ windowId: 'w1', action: 'focus' })).resolves.toEqual({
      windows: [ROW],
    });
    await expect(windows.change({ windowId: 'w2', action: 'close' })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(acted).toEqual(['focus w1', 'close w2']);
  });

  it('delivers the list when watched, again only when it changes, and stops the provider after the last watcher', async () => {
    const test = control({ kde: true, programs: [] });
    const seen: number[] = [];
    const stop = test.windows.watch((state) => seen.push(state.windows.length));
    await settle();
    test.clock.advance();
    await settle();
    expect(seen).toEqual([1]);
    test.changed();
    test.clock.advance();
    await settle();
    expect(seen).toEqual([1]);
    test.rows.push({ ...ROW, id: 'w2' });
    test.changed();
    test.clock.advance();
    await settle();
    expect(seen).toEqual([1, 2]);
    expect(test.watched).toEqual([1]);
    stop();
    expect(test.watched).toEqual([1, -1]);
  });
});
