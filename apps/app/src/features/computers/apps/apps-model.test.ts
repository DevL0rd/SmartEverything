import { describe, expect, it } from 'vitest';
import type { ComputerApps } from '@smarteverything/domain';
import {
  desktopLabel,
  matchingInstalled,
  openTargetError,
  runningIds,
  usedApps,
  windowLine,
} from './apps-model';

const APPS: ComputerApps = {
  installed: [
    { id: 'term', name: 'Terminal', comment: 'Run commands', icon: null },
    { id: 'fx', name: 'Firefox', comment: null, icon: null },
    { id: 'obs', name: 'OBS Studio', comment: 'Record and stream', icon: null },
  ],
  focused: { id: 'fx', name: 'Firefox' },
  today: [
    { appId: 'fx', name: 'Firefox', seconds: 5400 },
    { appId: 'term', name: 'Terminal', seconds: 600 },
  ],
  week: [],
};

describe('usedApps', () => {
  const none: ReadonlySet<string> = new Set();

  it('lists the app in front first and does not repeat it from today', () => {
    expect(usedApps(APPS, new Set(['term']))).toEqual([
      { id: 'fx', name: 'Firefox', line: 'In front now', running: true },
      { id: 'term', name: 'Terminal', line: 'Open · 10 min today', running: true },
    ]);
  });

  it('marks apps that are no longer open', () => {
    expect(usedApps({ ...APPS, focused: null }, none).map((app) => app.running)).toEqual([
      false,
      false,
    ]);
  });

  it('hides desktop shell components and apps used for under a minute', () => {
    const apps: ComputerApps = {
      ...APPS,
      focused: { id: 'org.kde.plasmashell', name: 'plasmashell' },
      today: [
        { appId: 'org.kde.plasmashell', name: 'plasmashell', seconds: 9000 },
        { appId: 'fx', name: 'Firefox', seconds: 30 },
        { appId: 'term', name: 'Terminal', seconds: 600 },
      ],
    };
    expect(usedApps(apps, none).map((app) => app.id)).toEqual(['term']);
  });
});

describe('matchingInstalled', () => {
  it('sorts by name and matches name or comment', () => {
    expect(matchingInstalled(APPS.installed, '').map((app) => app.name)).toEqual([
      'Firefox',
      'OBS Studio',
      'Terminal',
    ]);
    expect(matchingInstalled(APPS.installed, 'stream').map((app) => app.id)).toEqual(['obs']);
  });
});

describe('runningIds', () => {
  it('counts apps with a window and the app in front', () => {
    const ids = runningIds([{ app: { id: 'fx' } }, { app: null }, { app: { id: 'term' } }], 'obs');
    expect([...ids].sort()).toEqual(['fx', 'obs', 'term']);
    expect(runningIds(undefined, null).size).toBe(0);
  });
});

describe('windowLine', () => {
  it('names the app, the desktop and the state', () => {
    expect(
      windowLine({
        app: { name: 'Firefox' },
        desktop: 'Desktop 2',
        minimised: true,
        focused: false,
      }),
    ).toBe('Firefox · Desktop 2 · Minimised');
    expect(windowLine({ app: null, desktop: null, minimised: false, focused: true })).toBe(
      'In front',
    );
  });
});

describe('desktopLabel', () => {
  it('turns a bare desktop number into words and keeps a desktop name', () => {
    expect(desktopLabel('1')).toBe('Desktop 1');
    expect(desktopLabel('1, 2')).toBe('Desktops 1, 2');
    expect(desktopLabel('Work')).toBe('Work');
  });
});

describe('openTargetError', () => {
  it('accepts web, mail and phone links and absolute file paths of every system', () => {
    [
      'https://example.com/a',
      'mailto:me@example.com',
      'tel:+15551234',
      '/home/me/a.pdf',
      'C:\\Users\\me\\a.pdf',
    ].forEach((text) => {
      expect(openTargetError(text)).toBeNull();
    });
  });

  it('asks for a link or an absolute path when the text is neither', () => {
    expect(openTargetError('report.pdf')).toBe(
      'Enter a web, mail or phone link, or an absolute file path.',
    );
  });
});
