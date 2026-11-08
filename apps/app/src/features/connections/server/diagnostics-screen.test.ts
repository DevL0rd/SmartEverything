import type { DesktopServiceLogs, HubStatus, PushStatus } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ListRowProps } from '../../../components/list-row';

interface TextProps {
  readonly children: ReactNode;
  readonly numberOfLines?: number;
}

interface CopyProps {
  readonly label: string;
  readonly value: string;
}

type Read<T> =
  | { readonly isPending: false; readonly isError: true; readonly error: Error }
  | { readonly isPending: false; readonly isError: false; readonly data: T };

const fixture = vi.hoisted(() => ({
  error: false,
  lines: Array.from({ length: 100 }, (_, index) => `Synthetic log line ${String(index)}`),
  file: '/fixture/' + 'long-path-segment/'.repeat(12) + 'service.log',
  detail: 'The fixture failed to read its log. '.repeat(12),
  version: 'version-' + 'long-build-marker-'.repeat(8),
  text: vi.fn<(_: TextProps) => null>(() => null),
  row: vi.fn<(_: ListRowProps) => null>(() => null),
  copy: vi.fn<(_: CopyProps) => null>(() => null),
  scroll: vi.fn<() => null>(() => null),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({
  View: childrenOf,
  Text: fixture.text,
  ScrollView: fixture.scroll,
}));
vi.mock('../../../api/desktop-service', () => ({
  useServiceLogTail: (): Read<DesktopServiceLogs> =>
    fixture.error
      ? { isPending: false, isError: true, error: Error(fixture.detail) }
      : { isPending: false, isError: false, data: { file: fixture.file, lines: fixture.lines } },
}));
vi.mock('../../../api/diagnostics', () => ({
  usePushDeliveries: (): Read<PushStatus> =>
    fixture.error
      ? { isPending: false, isError: true, error: Error(fixture.detail) }
      : {
          isPending: false,
          isError: false,
          data: {
            sent: 0,
            failed: 0,
            removed: 0,
            lastError: null,
            lastAttemptAt: null,
            lastSentAt: null,
          },
        },
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => label,
}));
vi.mock('../../../components/copy-button', () => ({ CopyButton: fixture.copy }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/list-row', () => ({ ListRow: fixture.row }));
vi.mock('../../../components/rows', () => ({ ValueRow: (): null => null }));
vi.mock('../../../components/section', () => ({ List: childrenOf, Section: childrenOf }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: fixture.text }));
vi.mock('../../../design/platform', () => ({
  desktopBridge: (): { readonly fixture: true } => ({ fixture: true }),
}));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: childrenOf }));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => 0 }));
vi.mock('../../../store/selectors', () => ({
  useHubStatus: (): HubStatus => ({
    version: fixture.version,
    startedAt: '1970-01-01T00:00:00Z',
    cameras: 'running',
  }),
  useIsOwner: (): boolean => true,
  useServiceLog: (): readonly string[] => [],
}));

const { DiagnosticsScreen } = await import('./diagnostics-screen');

describe('Server diagnostics details', () => {
  it('renders and copies every supplied log line in the page scroll and wraps the version', () => {
    fixture.error = false;
    renderToStaticMarkup(createElement(DiagnosticsScreen));
    const code = fixture.lines.join('\n');
    expect(fixture.text.mock.calls.map(([props]) => props.children)).toContain(code);
    expect(fixture.copy.mock.lastCall?.[0]).toMatchObject({
      label: `Copy ${fixture.file}`,
      value: code,
    });
    expect(fixture.scroll).not.toHaveBeenCalled();
    expect(fixture.row.mock.lastCall?.[0]).toMatchObject({
      title: 'Version',
      subtitle: fixture.version,
      wrapSubtitle: true,
    });
  });

  it('shows the complete push and desktop log errors alongside retry', () => {
    fixture.error = true;
    fixture.text.mockClear();
    const html = renderToStaticMarkup(createElement(DiagnosticsScreen));
    const errors = fixture.text.mock.calls
      .map(([props]) => props)
      .filter(({ children }) => children === fixture.detail);
    expect(errors).toHaveLength(2);
    expect(errors.every(({ numberOfLines }) => numberOfLines === undefined)).toBe(true);
    expect(html.match(/Try again/g)).toHaveLength(2);
  });
});
