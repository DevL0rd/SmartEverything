import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceLogEntry } from '@smarteverything/domain';
import { COLOUR_VARIABLE, PaletteContext } from '../../../design/colour-roles';
import type { DeviceLogPages } from './use-device-log';

const AUTOMATION = '00000000-0000-4000-8000-000000000009';

interface Hooks {
  latest: DeviceLogEntry | undefined;
  pages: DeviceLogPages | undefined;
  latestCalls: number;
}

const hooks: Hooks = vi.hoisted(() => ({ latest: undefined, pages: undefined, latestCalls: 0 }));

vi.mock('./use-device-log', () => ({
  useLatestLogEntry: (): DeviceLogEntry | undefined => {
    hooks.latestCalls += 1;
    return hooks.latest;
  },
  useDeviceLogPages: (): DeviceLogPages | undefined => hooks.pages,
}));

vi.mock('../../../store/clock', () => ({
  useMinute: (): number => Date.parse('2026-10-18T12:00:00.000Z'),
}));

const { DeviceLog } = await import('./device-log');
const { LogTicker } = await import('./log-ticker');

const PRESS: DeviceLogEntry = {
  at: '2026-10-18T11:30:00.000Z',
  kind: 'press',
  title: 'Pressed',
  cause: { kind: 'button' },
  effects: [{ title: 'Kitchen brighter', automationId: AUTOMATION, outcome: 'ok' }],
};

const CHANGE: DeviceLogEntry = {
  at: '2026-10-18T11:00:00.000Z',
  kind: 'change',
  title: 'Turned on',
  value: 'On',
  cause: { kind: 'app', name: 'Dana' },
};

function pages(patch: Partial<DeviceLogPages>): DeviceLogPages {
  return {
    entries: [],
    loading: false,
    failure: null,
    more: false,
    loadingMore: false,
    loadMore: (): undefined => undefined,
    retry: (): undefined => undefined,
    ...patch,
  };
}

function html(node: ReactNode): string {
  return renderToStaticMarkup(createElement(PaletteContext, { value: COLOUR_VARIABLE }, node));
}

beforeEach(() => {
  hooks.latest = undefined;
  hooks.pages = undefined;
  hooks.latestCalls = 0;
});

describe('the device log list', () => {
  it('lists each entry with its time, value, cause and what a press did', () => {
    hooks.pages = pages({ entries: [PRESS, CHANGE] });
    const shown = html(createElement(DeviceLog, { deviceId: 'd' }));
    expect(shown).toContain('role="list"');
    expect(shown.split('role="listitem"')).toHaveLength(3);
    expect(shown).toContain('30 min');
    expect(shown).toContain('Button');
    expect(shown).toContain('Kitchen brighter');
    expect(shown).toContain('App · Dana');
    expect(shown).toContain('>On<');
  });

  it('says so when nothing happened yet', () => {
    hooks.pages = pages({});
    expect(html(createElement(DeviceLog, { deviceId: 'd' }))).toContain('Nothing yet');
  });

  it('keeps the same shape while loading', () => {
    hooks.pages = pages({ loading: true });
    const shown = html(createElement(DeviceLog, { deviceId: 'd' }));
    expect(shown).toContain('aria-busy="true"');
    expect(shown).not.toContain('role="list"');
  });

  it('shows the reason and a retry when the first read fails', () => {
    hooks.pages = pages({ failure: new Error('Hub unreachable') });
    const shown = html(createElement(DeviceLog, { deviceId: 'd' }));
    expect(shown).toContain('Try again');
  });

  it('offers more only while the hub has older entries', () => {
    hooks.pages = pages({ entries: [CHANGE], more: true });
    expect(html(createElement(DeviceLog, { deviceId: 'd' }))).toContain('Show more');
    hooks.pages = pages({ entries: [CHANGE] });
    expect(html(createElement(DeviceLog, { deviceId: 'd' }))).not.toContain('Show more');
  });
});

describe('the card ticker', () => {
  it('collapses when the device has no log yet', () => {
    expect(html(createElement(LogTicker, { deviceId: 'd', live: true }))).toBe('');
  });

  it('prints one line: time, what happened, cause', () => {
    hooks.latest = CHANGE;
    const shown = html(createElement(LogTicker, { deviceId: 'd', live: true }));
    expect(shown).toContain('Turned on · App · Dana');
  });
});
