import { act, createElement, Fragment, use, useEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BaseNavigationContainer,
  createNavigationContainerRef,
  useNavigationBuilder,
} from 'expo-router/build/react-navigation/core';
import { Screen } from 'expo-router/build/react-navigation/core/Screen';
import { TabRouter } from 'expo-router/build/react-navigation/routers';
import type { SectionRailProps } from '../components/page-shell/section-rail';
import type { ShellSections } from '../components/page-shell/shell-sections';
import { CLOCK_SECTION_ROUTES, type ClockSection } from '../features/clock/model/section-routes';
import { clockSectionsOf } from '../features/clock/frame/clock-sections';

interface RailInstance {
  readonly id: number;
  readonly active: string;
  readonly scrollTop: number;
  readonly scrollTo: (top: number) => void;
}

const rails = vi.hoisted(() => ({
  mounts: 0,
  shown: new Map<number, RailInstance>(),
}));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));

vi.mock('expo-router', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../test-support/expo-router')),
  useIsFocused: (
    await vi.importActual<{ readonly useIsFocused: () => boolean }>(
      'expo-router/build/react-navigation/core',
    )
  ).useIsFocused,
}));

vi.mock('../design/size-class', () => ({
  useSizeClass: (): { readonly header: string; readonly area: number } => ({
    header: 'desktop',
    area: 1400,
  }),
}));

vi.mock('../components/page-shell/section-rail', () => ({
  SectionRail: function SectionRail(props: SectionRailProps): null {
    const [id] = useState(() => {
      rails.mounts += 1;
      return rails.mounts;
    });
    const [scrollTop, scrollTo] = useState(0);
    useEffect(() => {
      rails.shown.set(id, { id, active: props.active, scrollTop, scrollTo });
      return (): void => {
        rails.shown.delete(id);
      };
    }, [id, props.active, scrollTop]);
    return null;
  },
}));

const { SectionHost } = await import('./section-host');
const { RailHostContext } = await import('../components/page-shell/rail-host');
const { RailPublisher } = await import('../components/page-shell/rail-publish');

const pageMounts = new Map<string, number>();
const NO_RAIL_PAGE = 'stopwatch';

function ClockPage({ route }: { readonly route: { readonly name: string } }): ReactNode {
  const host = use(RailHostContext);
  useEffect(() => {
    pageMounts.set(route.name, (pageMounts.get(route.name) ?? 0) + 1);
  }, [route.name]);
  if (host === null) throw new Error('The page is not inside a section host.');
  const sections: ShellSections | null = withoutRail.has(route.name)
    ? null
    : clockSectionsOf(sectionOf(route.name));
  return createElement(RailPublisher, { host, sections });
}

const withoutRail = new Set<string>();

function sectionOf(name: string): ClockSection {
  const section = CLOCK_SECTION_ROUTES.find((entry) => entry === name);
  if (section === undefined) throw new Error(`No Clock section ${name}.`);
  return section;
}

const shownKeys = new Set<string>();

function SectionsLike({ children }: { readonly children?: ReactNode }): ReactNode {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(TabRouter as never, {
    children,
    backBehavior: 'initialRoute',
    initialRouteName: 'index',
  });
  const current = state.routes[state.index];
  if (current !== undefined) shownKeys.add(current.key);
  return createElement(
    NavigationContent,
    null,
    ...state.routes
      .filter((route) => shownKeys.has(route.key))
      .map((route) =>
        createElement(Fragment, { key: route.key }, descriptors[route.key]?.render()),
      ),
  );
}

const container = createNavigationContainerRef();

function App(): ReactNode {
  const screens = CLOCK_SECTION_ROUTES.map((name) =>
    createElement(Screen, { key: name, name, component: ClockPage }),
  );
  const host = createElement(SectionHost, null, createElement(SectionsLike, null, ...screens));
  const navigation = { ref: container, children: host };
  return createElement(BaseNavigationContainer, navigation);
}

function open(name: string): void {
  act(() => {
    container.dispatch({ type: 'NAVIGATE', payload: { name } });
  });
}

function onlyRail(): RailInstance {
  const shown = [...rails.shown.values()];
  if (shown.length !== 1) throw new Error(`Expected one rail, found ${String(shown.length)}.`);
  const [rail] = shown;
  if (rail === undefined) throw new Error('No rail is shown.');
  return rail;
}

let root: Root;

beforeEach(() => {
  rails.mounts = 0;
  rails.shown.clear();
  pageMounts.clear();
  shownKeys.clear();
  withoutRail.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(App));
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe('the section host', () => {
  it('mounts one sidebar for the whole area and moves its selection with each section', () => {
    expect(onlyRail().active).toBe('index');
    for (const name of ['bedtime', 'timers', 'stopwatch', 'world', 'index']) {
      open(name);
      expect(onlyRail().active).toBe(name);
    }
    expect(rails.mounts).toBe(1);
    expect(Object.fromEntries(pageMounts)).toEqual({
      index: 1,
      bedtime: 1,
      timers: 1,
      stopwatch: 1,
      world: 1,
    });
  });

  it('keeps the sidebar scroll offset across section switches', () => {
    act(() => {
      onlyRail().scrollTo(240);
    });
    open('timers');
    open('world');
    open('index');
    expect(onlyRail().scrollTop).toBe(240);
    expect(rails.mounts).toBe(1);
  });

  it('hides the sidebar on a page without sections and shows it again on the next section', () => {
    withoutRail.add(NO_RAIL_PAGE);
    open(NO_RAIL_PAGE);
    expect(rails.shown.size).toBe(0);
    open('timers');
    expect(onlyRail().active).toBe('timers');
  });
});
