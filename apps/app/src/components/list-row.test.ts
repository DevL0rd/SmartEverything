import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const tree = vi.hoisted(() => ({
  values: new Array<Record<string, unknown>>(),
  views: new Array<string>(),
}));

vi.mock('react-native', () => ({
  View: (props: { readonly className?: string; readonly children?: ReactNode }): ReactNode => {
    tree.views.push(props.className ?? '');
    return props.children;
  },
}));
vi.mock('expo-router', () => ({}));
vi.mock('./icon', () => ({ Icon: (): null => null }));
vi.mock('./interactive', () => ({
  Interactive: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('./menu', () => ({ useContextMenu: (): { host: null } => ({ host: null }) }));
vi.mock('./highlighted', () => ({ Highlighted: (): null => null }));
vi.mock('../design/platform', () => ({ useIdiom: (): string => 'touch' }));
vi.mock('./text', () => ({
  Text: (props: Record<string, unknown>): null => {
    tree.values.push(props);
    return null;
  },
}));

const { ListRow } = await import('./list-row');

describe('ListRow value', () => {
  it('caps and shrinks the value in a wrapper so the title stays visible', () => {
    renderToStaticMarkup(createElement(ListRow, { title: 'Home', value: 'A long home name' }));
    expect(tree.views).toContain('min-w-0 max-w-48 shrink');
    const value = tree.values.find((props) => props['children'] === 'A long home name');
    expect(value).toMatchObject({ numberOfLines: 1 });
    expect(value).not.toHaveProperty('className');
  });
});
