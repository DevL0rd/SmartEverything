import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type * as ReactNative from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import type { ListRowProps } from '../../../components/list-row';

const rendered = vi.hoisted(() => {
  const text: string[] = [];
  const row = vi.fn<(props: ListRowProps) => null>(() => null);
  return { text, row, search: vi.fn<(query: string) => void>() };
});

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', async (original) => ({
  ...(await original<typeof ReactNative>()),
  View: childrenOf,
}));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: childrenOf }));
vi.mock('../../../components/list-row', () => ({ ListRow: rendered.row }));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): null => {
    if (typeof children === 'string') rendered.text.push(children);
    return null;
  },
}));
vi.mock('../../../components/search-field', () => ({
  SearchField: ({ onChange }: { readonly onChange: (query: string) => void }): null => {
    rendered.search.mockImplementation(onChange);
    return null;
  },
}));

const { LicencesScreen } = await import('./licences-screen');

function withLicences(check: () => void): void {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  rendered.text.length = 0;
  rendered.row.mockClear();
  try {
    act(() => {
      root.render(createElement(LicencesScreen));
    });
    check();
  } finally {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
}

describe('Open-source licences', () => {
  it('shows an empty message instead of a sticky count when no package matches the search', () => {
    withLicences(() => {
      expect(rendered.text).toContainEqual(expect.stringMatching(/^[1-9]\d* packages$/));

      rendered.text.length = 0;
      act(() => {
        rendered.search('no matching licence '.repeat(12));
      });
      expect(rendered.text).toContain('No packages match your search.');
      expect(rendered.text).not.toContain('0 packages');

      rendered.text.length = 0;
      act(() => {
        rendered.search('');
      });
      expect(rendered.text).toContainEqual(expect.stringMatching(/^[1-9]\d* packages$/));
    });
  });

  it('renders the complete licence expression in the wrapping package metadata', () => {
    withLicences(() => {
      rendered.row.mockClear();
      act(() => {
        rendered.search('@img/sharp-wasm32');
      });
      expect(rendered.row.mock.calls.map(([props]) => props)).toContainEqual({
        title: '@img/sharp-wasm32',
        subtitle: '0.35.5 · Apache-2.0 AND LGPL-3.0-or-later AND MIT',
        compact: true,
        wrapTitle: true,
        wrapSubtitle: true,
      });
    });
  });
});
