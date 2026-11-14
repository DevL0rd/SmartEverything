import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeaderAction } from '../page-header';
import type { SectionRailProps } from '../section-rail';
import type { LibraryFrameProps } from './library-frame';
import type { SectionPullUpProps } from './section-pull-up';

interface Seen {
  area: number;
  header: {
    readonly title: string;
    readonly search: boolean;
    readonly actions: readonly HeaderAction[];
    readonly onTitlePress?: () => void;
  } | null;
  rail: SectionRailProps | null;
  pullUp: SectionPullUpProps | null;
  screen: { readonly scroll: boolean; readonly onRefresh?: () => void } | null;
  refreshed: number;
}

const seen = vi.hoisted((): Seen => ({
  area: 412,
  header: null,
  rail: null,
  pullUp: null,
  screen: null,
  refreshed: 0,
}));

vi.mock('../../design/size-class', () => ({ useAreaWidth: (): number => seen.area }));
vi.mock('../page-header', () => ({
  PageHeader: (props: NonNullable<Seen['header']>): null => {
    seen.header = props;
    return null;
  },
}));
vi.mock('../screen', () => ({
  Screen: (props: {
    readonly scroll: boolean;
    readonly onRefresh?: () => void;
    readonly header: ReactNode;
    readonly children: ReactNode;
  }): ReactNode => {
    seen.screen = props;
    return createElement('main', {}, props.header, props.children);
  },
}));
vi.mock('../section-body', () => ({
  CompactBody: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('section', { 'data-body': 'compact' }, children),
  WideBody: ({
    rail,
    children,
  }: {
    readonly rail: ReactNode;
    readonly children: ReactNode;
  }): ReactNode => createElement('section', { 'data-body': 'wide' }, rail, children),
}));
vi.mock('../section-rail', () => ({
  SectionRail: (props: SectionRailProps): ReactNode => {
    seen.rail = props;
    return createElement('nav', {}, props.footer);
  },
}));
vi.mock('./section-pull-up', () => ({
  SectionPullUp: (props: SectionPullUpProps): null => {
    seen.pullUp = props;
    return null;
  },
}));
const { LibraryFrame } = await import('./library-frame');

const FRAME: LibraryFrameProps = {
  area: 'photos',
  title: 'Photos',
  settings: { href: '/settings/photos', label: 'photos' },
  refresh: {
    refreshing: false,
    refresh: (): void => {
      seen.refreshed += 1;
    },
  },
  actions: [{ icon: 'search', label: 'Search', iconOnly: true }],
  sections: [
    { title: null, sections: [{ id: 'index', label: 'Timeline', icon: 'image', count: 3 }] },
    { title: 'Library', sections: [{ id: 'deleted', label: 'Deleted', icon: 'trash', count: 1 }] },
  ],
  active: 'index',
  hrefOf: (id) => (id === 'index' ? '/photos' : '/photos/deleted'),
  summary: createElement('aside', {}, 'Library summary'),
  chips: createElement('div', { role: 'toolbar' }, 'Chips'),
  children: createElement('p', {}, 'Page body'),
};

function render(area: number, patch: Partial<LibraryFrameProps> = {}): string {
  seen.area = area;
  return renderToStaticMarkup(createElement(LibraryFrame, { ...FRAME, ...patch }));
}

beforeEach(() => {
  seen.header = null;
  seen.rail = null;
  seen.pullUp = null;
  seen.screen = null;
  seen.refreshed = 0;
});

describe('library frame on a phone', () => {
  it('puts the chip row over the body, with no rail, and lets the title open the pull-up', () => {
    const markup = render(412);
    expect(markup).toContain('data-body="compact"');
    expect(markup.indexOf('Chips')).toBeLessThan(markup.indexOf('Page body'));
    expect(seen.rail).toBeNull();
    expect(seen.header?.onTitlePress).toBeTypeOf('function');
    expect(seen.pullUp?.groups).toBe(FRAME.sections);
    expect(seen.pullUp?.open).toBe(false);
  });

  it('hands the pull-up the summary well and the active section, and pulls to refresh', () => {
    render(412);
    expect(seen.pullUp?.summary).toBe(FRAME.summary);
    expect(seen.pullUp?.active).toBe('index');
    expect(seen.screen?.scroll).toBe(true);
    seen.screen?.onRefresh?.();
    expect(seen.refreshed).toBe(1);
  });

  it('hands the pull-up the page footer with a close that shuts the pull-up', () => {
    let closer: (() => void) | null = null;
    render(412, {
      renderPullUpFooter: (close) => {
        closer = close;
        return createElement('footer', {}, 'Settings row');
      },
    });
    expect(seen.pullUp?.footer).toBeDefined();
    expect(closer).toBeTypeOf('function');
  });

  it('shows global search by default and lets pages with their own search omit it', () => {
    render(412, { area: 'drive' });
    expect(seen.header?.search).toBe(true);
    render(412, { search: false });
    expect(seen.header?.search).toBe(false);
  });

  it('keeps the header actions as the page passed them', () => {
    render(412);
    expect(seen.header?.actions.map((action) => action.label)).toEqual(['Search']);
  });
});

describe('library frame on a desktop', () => {
  it('shows the wide rail with counts and the summary well as its footer', () => {
    const markup = render(1280);
    expect(markup).toContain('data-body="wide"');
    expect(seen.rail?.width).toBe('wide');
    expect(seen.rail?.groups[0]?.entries[0]?.count).toBe('3');
    expect(seen.rail?.footer).toBe(FRAME.summary);
    expect(markup).toContain('Library summary');
    expect(markup).not.toContain('Chips');
    expect(seen.pullUp).toBeNull();
    expect(seen.header?.onTitlePress).toBeUndefined();
  });

  it('adds a refresh action after the page actions that refreshes the library', () => {
    render(1280);
    const actions = seen.header?.actions ?? [];
    expect(actions.map((action) => action.label)).toEqual(['Search', 'Refresh']);
    actions[1]?.onPress?.();
    expect(seen.refreshed).toBe(1);
    expect(seen.screen?.scroll).toBe(false);
  });

  it('hands the page header the settings link the page passes', () => {
    render(1280, { settings: { href: '/settings/drive', label: 'Drive settings' } });
    expect(seen.header).toMatchObject({
      settings: { href: '/settings/drive', label: 'Drive settings' },
    });
  });

  it('drops to the icon rail without the summary footer when the page asks', () => {
    render(1280, { iconRail: true });
    expect(seen.rail?.width).toBe('icon');
    expect(seen.rail?.footer).toBeUndefined();
  });

  it('drops the summary footer on the narrow icon rail', () => {
    render(768);
    expect(seen.rail?.width).toBe('icon');
    expect(seen.rail?.footer).toBeUndefined();
  });
});
