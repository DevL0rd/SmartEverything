import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionPullUpProps } from './section-pull-up';

interface Row {
  readonly href: string;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}

const seen = vi.hoisted((): { rows: Row[]; sheet: Record<string, unknown> | null } => ({
  rows: [],
  sheet: null,
}));

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('div', {}, children),
  ScrollView: (): null => null,
  StyleSheet: { create: <T>(styles: T): T => styles },
}));
vi.mock('../bottom-sheet', () => ({
  BottomSheet: (props: { readonly children: ReactNode; readonly open: boolean }): ReactNode => {
    seen.sheet = props;
    return props.open ? createElement('dialog', {}, props.children) : null;
  },
}));
vi.mock('../interactive', () => ({
  Interactive: (props: Row & { readonly children: ReactNode }): ReactNode => {
    seen.rows.push(props);
    return createElement('a', { href: props.href }, props.children);
  },
}));
vi.mock('../icon', () => ({ Icon: (): null => null }));
vi.mock('../text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('span', {}, children),
}));

const { SectionPullUp } = await import('./section-pull-up');

const onClose = vi.fn();

const PROPS: SectionPullUpProps = {
  open: true,
  onClose,
  title: 'Drive',
  groups: [
    {
      title: null,
      sections: [
        { id: 'index', label: 'My Drive', icon: 'folder', count: 4 },
        {
          id: 'recent',
          label: 'Recent',
          icon: 'clock',
          count: null,
          detail: createElement('em', {}, '14 opened today'),
        },
      ],
    },
    { title: 'Library', sections: [{ id: 'trash', label: 'Trash', icon: 'trash', count: 129 }] },
  ],
  active: 'recent',
  hrefOf: (id) => (id === 'index' ? '/drive' : id === 'recent' ? '/drive/recent' : '/drive/trash'),
  summary: createElement('aside', {}, 'Storage well'),
  footer: createElement('footer', {}, 'Drive settings'),
};

function render(patch: Partial<SectionPullUpProps> = {}): string {
  return renderToStaticMarkup(createElement(SectionPullUp, { ...PROPS, ...patch }));
}

beforeEach(() => {
  seen.rows = [];
  seen.sheet = null;
  onClose.mockClear();
});

describe('section pull-up', () => {
  it('lists the summary well first, then every section under its group heading', () => {
    const markup = render();
    expect(markup.indexOf('Storage well')).toBeLessThan(markup.indexOf('My Drive'));
    expect(markup.indexOf('My Drive')).toBeLessThan(markup.indexOf('Library'));
    expect(markup.indexOf('Library')).toBeLessThan(markup.indexOf('Trash'));
    expect(seen.sheet?.['label']).toBe('Drive sections');
  });

  it('shows a section detail under its label and the footer after every group', () => {
    const markup = render();
    expect(markup.indexOf('Recent')).toBeLessThan(markup.indexOf('14 opened today'));
    expect(markup.indexOf('14 opened today')).toBeLessThan(markup.indexOf('Library'));
    expect(markup.indexOf('Trash')).toBeLessThan(markup.indexOf('Drive settings'));
  });

  it('links each row to its section, marks the active one and speaks the count', () => {
    render();
    expect(seen.rows.map((row) => row.href)).toEqual(['/drive', '/drive/recent', '/drive/trash']);
    expect(seen.rows.map((row) => row.selected)).toEqual([false, true, false]);
    expect(seen.rows.map((row) => row.label)).toEqual(['My Drive, 4', 'Recent', 'Trash, 129']);
  });

  it('closes when a section is picked', () => {
    render();
    seen.rows[2]?.onPress();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the visible trailing count only where a section has one', () => {
    const markup = render();
    expect(markup).toContain('<span>4</span>');
    expect(markup).toContain('<span>129</span>');
  });

  it('renders nothing while closed', () => {
    expect(render({ open: false })).toBe('');
  });
});
