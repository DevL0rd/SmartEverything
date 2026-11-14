import type { AppHref } from '../components/app-href';
import type { AppPath, BackOpener, BackRules, BackStep } from '../components/back-navigation';

export interface BackPage {
  readonly href: AppHref;
  readonly parent: AppHref | null;
}

const SECTION_ROOTS: Readonly<Record<string, string>> = {
  device: '/devices',
  groups: '/devices',
  rooms: '/devices',
  'home-map': '/',
};

function segmentOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(segmentOf).join('/');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function isAppPath(path: string): path is AppPath {
  return path.startsWith('/');
}

export function pathOf(href: AppHref): string {
  if (typeof href === 'string') return href;
  const params: Readonly<Record<string, unknown>> = href.params ?? {};
  return href.pathname.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_, key: string) => segmentOf(params[key]));
}

interface NavigationLevel {
  readonly index?: number | undefined;
  readonly routes: readonly {
    readonly key?: string | undefined;
    readonly name: string;
    readonly state?: NavigationLevel | undefined;
  }[];
}

export function leafKeyOf(level: NavigationLevel): string {
  const route = level.routes[level.index ?? 0];
  if (route === undefined) return '';
  return route.state === undefined ? (route.key ?? route.name) : leafKeyOf(route.state);
}

function ancestorsOf(pathname: string): readonly string[] {
  const parts = pathname.split('/').filter((part) => part !== '');
  return parts
    .slice(0, -1)
    .map((_, index) => `/${parts.slice(0, parts.length - 1 - index).join('/')}`);
}

export interface BackTable {
  readonly isRoot: (pathname: string) => boolean;
  readonly parentOf: (pathname: string) => AppHref | null;
}

export function backTable(pages: readonly BackPage[]): BackTable {
  const byPath = new Map(pages.map((page) => [pathOf(page.href), page]));
  const sectionRoot = (pathname: string): AppHref | null => {
    const first = pathname.split('/').find((part) => part !== '');
    const root = first === undefined ? undefined : SECTION_ROOTS[first];
    return root === undefined ? null : (byPath.get(root)?.href ?? null);
  };
  return {
    isRoot: (pathname): boolean => {
      const page = byPath.get(pathname);
      return page?.parent === null;
    },
    parentOf: (pathname): AppHref | null => {
      const page = byPath.get(pathname);
      if (page !== undefined) return page.parent;
      const ancestor = ancestorsOf(pathname).find((path) => byPath.has(path));
      return ancestor === undefined ? sectionRoot(pathname) : (byPath.get(ancestor)?.href ?? null);
    },
  };
}

interface NavigationLevelKeys {
  readonly routes: readonly {
    readonly key?: string | undefined;
    readonly state?: NavigationLevelKeys | undefined;
  }[];
}

export function liveKeysOf(level: NavigationLevelKeys | undefined): ReadonlySet<string> {
  const keys = new Set<string>();
  const visit = (current: NavigationLevelKeys | undefined): void => {
    for (const route of current?.routes ?? []) {
      if (route.key !== undefined) keys.add(route.key);
      visit(route.state);
    }
  };
  visit(level);
  return keys;
}

export interface BackOrigins {
  readonly observe: (key: string, pathname: string, live: ReadonlySet<string>) => void;
  readonly callerOf: (key: string, pathname: string) => BackOpener | null;
  readonly isLive: (key: string) => boolean;
  readonly returned: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

interface Recorded {
  readonly key: string;
  readonly opener: BackOpener | null;
}

export function createBackOrigins(): BackOrigins {
  const callers = new Map<string, Recorded>();
  const listeners = new Set<() => void>();
  let live: ReadonlySet<string> = new Set();
  let here: { readonly id: string; readonly key: string; readonly pathname: string } | null = null;
  let returning = false;
  const prune = (): void => {
    for (const [id, recorded] of callers) {
      if (!live.has(recorded.key)) callers.delete(id);
    }
  };
  const openerFor = (pathname: string): BackOpener | null => {
    if (returning || here === null || here.pathname === pathname) return null;
    return isAppPath(here.pathname) ? { key: here.key, href: here.pathname } : null;
  };
  return {
    observe: (key, pathname, keys): void => {
      live = keys;
      prune();
      const id = `${key}|${pathname}`;
      if (here?.id === id) return;
      let recorded = false;
      if (!callers.has(id)) {
        const opener = openerFor(pathname);
        callers.set(id, { key, opener });
        recorded = opener !== null;
      }
      returning = false;
      here = { id, key, pathname };
      if (recorded) for (const listener of listeners) listener();
    },
    callerOf: (key, pathname): BackOpener | null =>
      callers.get(`${key}|${pathname}`)?.opener ?? null,
    isLive: (key): boolean => live.has(key),
    returned: (): void => {
      returning = true;
    },
    subscribe: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

export function createBackRules(table: BackTable, origins: BackOrigins): BackRules {
  return {
    stepFor: (pathname, opener): BackStep | null => {
      if (table.isRoot(pathname)) return null;
      const parent = table.parentOf(pathname);
      if (opener !== null && (parent === null || opener.href !== pathOf(parent))) {
        return { kind: 'caller', opener, parent };
      }
      return parent === null ? null : { kind: 'parent', parent };
    },
    callerOf: origins.callerOf,
    isLive: origins.isLive,
    returned: origins.returned,
    subscribe: origins.subscribe,
  };
}
