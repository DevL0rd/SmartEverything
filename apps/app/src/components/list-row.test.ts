import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const tree = vi.hoisted(() => ({
  values: new Array<Record<string, unknown>>(),
  views: new Array<string>(),
  nodes: new Array<Record<string, unknown>>(),
  presses: new Array<string>(),
}));

vi.mock('react-native', () => ({
  View: (props: { readonly className?: string; readonly children?: ReactNode }): ReactNode => {
    tree.views.push(props.className ?? '');
    tree.nodes.push(props);
    return props.children;
  },
}));
vi.mock('expo-router', () => ({}));
vi.mock('./icon', () => ({ Icon: (): null => null }));
vi.mock('./interactive', () => ({
  Interactive: ({
    children,
    className,
    expanded,
  }: {
    readonly children: ReactNode;
    readonly className: string;
    readonly expanded?: boolean;
  }): ReactNode => {
    tree.presses.push(className);
    return createElement('button', { 'aria-expanded': expanded }, children);
  },
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

describe('ListRow title wrapping', () => {
  it('lets an opted-in title wrap long unbroken web addresses', () => {
    tree.values.length = 0;
    renderToStaticMarkup(
      createElement(ListRow, { title: 'relay-' + 'a'.repeat(57) + '.test', wrapTitle: true }),
    );
    expect(tree.values[0]).toMatchObject({ className: 'web:wrap-anywhere' });
    expect(tree.values[0]).not.toHaveProperty('numberOfLines');
  });
});

describe('ListRow trailing controls', () => {
  it('lets a chevron-only title shrink inside a narrow navigation pane', () => {
    tree.views.length = 0;
    renderToStaticMarkup(
      createElement(ListRow, {
        title: 'Settings',
        icon: 'settings',
        chevron: true,
        onPress: () => undefined,
      }),
    );
    expect(tree.views).toContain('min-w-0 flex-1 gap-0.5');
    expect(tree.views).not.toContain('min-w-40 flex-1 gap-0.5');
  });

  it('retains the title minimum when a chevron follows a value', () => {
    tree.views.length = 0;
    renderToStaticMarkup(createElement(ListRow, { title: 'Home', value: 'A home', chevron: true }));
    expect(tree.views).toContain('min-w-40 flex-1 gap-0.5');
  });

  it('keeps trailing controls outside the pressable row so buttons never nest', () => {
    const markup = renderToStaticMarkup(
      createElement(ListRow, {
        title: 'Step',
        onPress: () => undefined,
        trailing: createElement('button', null, 'Raise'),
      }),
    );
    expect(markup).toBe('<button></button><button>Raise</button>');
  });

  it('lets taps on the value and chevron fall through to the row press area', () => {
    tree.nodes.length = 0;
    tree.presses.length = 0;
    renderToStaticMarkup(
      createElement(ListRow, {
        title: 'Step',
        onPress: () => undefined,
        value: 'Five',
        chevron: true,
        trailing: createElement('button', null, 'Raise'),
      }),
    );
    expect(tree.presses).toEqual(['absolute inset-0']);
    expect(tree.nodes[0]?.['className']).toContain('relative');
    const value = tree.nodes.find((node) => node['className'] === 'min-w-0 max-w-48 shrink');
    expect(value).toMatchObject({ pointerEvents: 'none', 'aria-hidden': true });
    const body = tree.nodes.find((node) => node['className'] === 'min-w-40 flex-1 gap-0.5');
    expect(body).toMatchObject({ pointerEvents: 'none' });
    const tail = tree.nodes.find((node) => String(node['className']).startsWith('ml-auto'));
    expect(tail).toMatchObject({ pointerEvents: 'box-none' });
    const chevron = tree.nodes.find(
      (node) => node['className'] === undefined && node['pointerEvents'] === 'none',
    );
    expect(chevron).toBeDefined();
  });

  it('keeps plain trailing content inside a row without controls', () => {
    const markup = renderToStaticMarkup(
      createElement(ListRow, { title: 'Step', onPress: () => undefined, value: 'Five' }),
    );
    expect(markup).toBe('<button></button>');
  });
});

describe('ListRow disclosure state', () => {
  it('exposes expanded and collapsed states only for disclosure rows', () => {
    const disclosure = { title: 'Events', onPress: (): void => undefined };
    const markup = (expanded: boolean): string =>
      renderToStaticMarkup(createElement(ListRow, { ...disclosure, expanded }));
    expect(markup(false)).toContain('aria-expanded="false"');
    expect(markup(true)).toContain('aria-expanded="true"');
    expect(renderToStaticMarkup(createElement(ListRow, disclosure))).not.toContain('aria-expanded');
  });
});
