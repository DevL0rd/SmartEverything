import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DeviceLogEntry } from '@smarteverything/domain';

const latest: { entry: DeviceLogEntry | undefined } = vi.hoisted(() => ({ entry: undefined }));

vi.mock('../../../components/text', () => ({
  Text: (props: { children?: ReactNode }): ReactNode => createElement('span', null, props.children),
}));

vi.mock('./use-device-log', () => ({
  useLatestLogEntry: (): DeviceLogEntry | undefined => latest.entry,
  useDeviceLogPages: (): undefined => undefined,
}));

const { LogTicker } = await import('./log-ticker');

function entryOf(kind: DeviceLogEntry['kind']): DeviceLogEntry {
  return {
    at: '2026-10-18T11:00:00.000Z',
    kind,
    title: 'Cooking finished',
    cause: { kind: 'device' },
  };
}

function shown(entry: DeviceLogEntry, omit?: DeviceLogEntry['kind']): string {
  latest.entry = entry;
  return renderToStaticMarkup(
    createElement(LogTicker, {
      deviceId: 'a',
      live: true,
      ...(omit === undefined ? {} : { omit }),
    }),
  );
}

describe('the log ticker', () => {
  it('shows the newest entry', () => {
    expect(shown(entryOf('cycle'))).toContain('Cooking finished');
  });

  it('leaves out a kind the card already says in its own words', () => {
    expect(shown(entryOf('cycle'), 'cycle')).toBe('');
    expect(shown(entryOf('change'), 'cycle')).toContain('Cooking finished');
  });
});
