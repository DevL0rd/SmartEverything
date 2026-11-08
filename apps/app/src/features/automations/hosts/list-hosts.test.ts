import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pane = vi.hoisted(() => ({ split: false, width: 'large', path: '/automations' }));
const frames = vi.hoisted(() => new Array<{ readonly split?: boolean }>());

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('expo-router', () => ({
  Stack: Object.assign((): null => null, { Screen: (): null => null }),
  useGlobalSearchParams: (): unknown => ({}),
  usePathname: (): string => pane.path,
  useRouter: (): unknown => ({ push: vi.fn() }),
}));
vi.mock('../../../app-shell/screen-pause', () => ({ screenPause: vi.fn() }));
vi.mock('../../../app-shell/tab-stack', () => ({ useStackOptions: (): unknown => ({}) }));
vi.mock('../../../components/master-detail', () => ({
  MasterDetail: (props: { readonly split?: boolean }): null => {
    frames.push(props);
    return null;
  },
}));
vi.mock('../../../design/size-class', () => ({ useSizeClass: (): unknown => pane }));
vi.mock('../../../store/selectors', () => ({ useRooms: (): unknown => [] }));
vi.mock('./use-environment', () => ({
  useRefNames: (): unknown => ({}),
  useFunctionLookup: (): unknown => ({}),
  usePlace: (): unknown => ({}),
}));
vi.mock('../list/automations-screen', () => ({
  AutomationsScreen: (): string => 'Automation list',
}));
vi.mock('../list/master', () => ({
  AutomationsMaster: (): string => 'Automation master',
  AutomationsOverviewPane: (): string => 'Automation overview',
}));

const { AutomationsIndexHost, AutomationsLayoutHost } = await import('./list-hosts');

beforeEach(() => {
  pane.split = false;
  pane.width = 'large';
  pane.path = '/automations';
  frames.length = 0;
});

describe('the automation list follows available master and detail room', () => {
  it('keeps the list reachable when a large window cannot fit both panes', () => {
    expect(renderToStaticMarkup(createElement(AutomationsIndexHost))).toBe('Automation list');
    renderToStaticMarkup(createElement(AutomationsLayoutHost));
    expect(frames[0]?.split).toBe(false);
  });

  it('shows the overview when a collapsed sidebar leaves room for both panes', () => {
    pane.width = 'expanded';
    pane.split = true;
    expect(renderToStaticMarkup(createElement(AutomationsIndexHost))).toBe('Automation overview');
    renderToStaticMarkup(createElement(AutomationsLayoutHost));
    expect(frames[0]?.split).toBe(true);
  });

  it.each(['/automations/a1/edit', '/automations/nodes/f1/edit'])(
    'keeps the editor full width at %s',
    (path) => {
      pane.path = path;
      pane.split = true;
      renderToStaticMarkup(createElement(AutomationsLayoutHost));
      expect(frames[0]?.split).toBe(false);
    },
  );
});
