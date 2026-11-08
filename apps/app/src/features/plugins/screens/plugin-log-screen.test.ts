import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PluginLogLine } from '@smarteverything/domain';

const view = vi.hoisted(() => ({
  log: vi.fn<() => readonly PluginLogLine[] | undefined>(),
  code: vi.fn<(props: { readonly code: string; readonly label: string }) => null>(() => null),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({
  View: ({
    className,
    accessibilityLabel,
    children,
  }: {
    readonly className?: string;
    readonly accessibilityLabel?: string;
    readonly children: ReactNode;
  }): ReactNode => createElement('div', { className, 'aria-label': accessibilityLabel }, children),
}));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: childrenOf }));
vi.mock('../../../components/code', () => ({ CodeBlock: view.code }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/error-state', () => ({ ErrorState: (): null => null }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): null => null }));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { pluginSettings: (id: string): string => `/settings/plugins/${id}` },
}));
vi.mock('../../../format/time', () => ({ clock: (): string => '12:00 AM' }));
vi.mock('../data/plugin-queries', () => ({
  usePluginLog: (): {
    readonly data: readonly PluginLogLine[] | undefined;
    readonly isError: false;
  } => ({
    data: view.log(),
    isError: false,
  }),
}));
vi.mock('./plugin-screen', () => ({
  MissingPlugin: (): null => null,
  usePluginParam: (): { readonly id: string; readonly manifest: { readonly name: string } } => ({
    id: 'fixture',
    manifest: { name: 'Fixture plugin' },
  }),
}));

const { PluginLogScreen } = await import('./plugin-log-screen');

describe('Plugin log', () => {
  it('keeps whitespace, punctuation and line order in the code and copy value', () => {
    const at = '2026-01-01T00:00:00Z';
    view.log.mockReturnValue([
      { at, line: '  raw\tindent  ' },
      { at, line: '“quoted” text' },
    ]);
    renderToStaticMarkup(createElement(PluginLogScreen, { pluginId: 'fixture' }));
    expect(view.code.mock.lastCall?.[0]).toEqual({
      label: 'Fixture plugin log',
      code: '12:00 AM    raw\tindent  \n12:00 AM  “quoted” text',
    });
  });

  it('names the compact pending state within the reading measure', () => {
    view.log.mockReturnValue(undefined);
    const html = renderToStaticMarkup(createElement(PluginLogScreen, { pluginId: 'fixture' }));
    expect(html).toContain('class="w-full max-w-reading"');
    expect(html).toContain('aria-label="Loading plugin log"');
  });
});
