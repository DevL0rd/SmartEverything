import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DeviceLogPages } from './use-device-log';

interface Props {
  readonly children?: ReactNode;
  readonly className?: string;
}

const { readLog } = vi.hoisted(() => ({
  readLog: vi.fn<() => DeviceLogPages>(),
}));

vi.mock('react-native', () => ({ View: passthrough }));
vi.mock('../../../components/button', () => ({ Button: passthrough }));
vi.mock('../../../components/card', () => ({
  Card: ({ className, children }: Props): ReactNode =>
    createElement('article', { className }, children),
}));
vi.mock('../../../components/error-state', () => ({ ErrorState: passthrough }));
vi.mock('../../../components/icon', () => ({ Icon: passthrough }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: passthrough }));
vi.mock('../../../components/text', () => ({ Text: passthrough }));
vi.mock('../../../store/clock', () => ({
  useMinute: (): number => Date.parse('2026-11-06T00:00:00Z'),
}));
vi.mock('./cause-chip', () => ({ CauseChip: passthrough }));
vi.mock('./use-device-log', () => ({ useDeviceLogPages: readLog }));

function passthrough({ children }: Props): ReactNode {
  return createElement('div', {}, children);
}

const { DeviceLogCard } = await import('./device-log');

const EMPTY: DeviceLogPages = {
  entries: [],
  loading: false,
  failure: null,
  more: false,
  loadingMore: false,
  loadMore: (): void => undefined,
  retry: (): void => undefined,
};

function render(log: DeviceLogPages): string {
  readLog.mockReturnValue(log);
  return renderToStaticMarkup(createElement(DeviceLogCard, { deviceId: 'fixture-device' }));
}

describe('device activity card', () => {
  it('uses the reading measure for the empty explanation', () => {
    const page = render(EMPTY);
    expect(page).toContain('w-full max-w-reading self-start');
    expect(page).toContain('Nothing yet.');
  });

  it('keeps the available width for loading, errors and populated logs', () => {
    const page = render({
      ...EMPTY,
      entries: [
        {
          at: '2026-11-06T00:00:00Z',
          kind: 'change',
          title: 'Fixture change',
          cause: { kind: 'device' },
        },
      ],
    });
    expect(page).toContain('Fixture change');
    expect(page).not.toContain('max-w-reading');
    expect(render({ ...EMPTY, loading: true })).not.toContain('max-w-reading');
    expect(render({ ...EMPTY, failure: new Error('Fixture') })).not.toContain('max-w-reading');
  });
});
