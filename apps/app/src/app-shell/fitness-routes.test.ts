import Module, { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const APP = join(import.meta.dirname, '../../app');
const BUILD = join(import.meta.dirname, '../../../../node_modules/expo-router/build');

const LEVEL = z.object({
  index: z.number().optional(),
  routes: z.array(z.object({ name: z.string(), state: z.unknown().optional() }).loose()),
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

function routeModule(key: string): object {
  const initial = /initialRouteName:\s*'([^']+)'/.exec(readFileSync(join(APP, key), 'utf8'))?.[1];
  return initial === undefined
    ? { default: () => null }
    : { default: () => null, unstable_settings: { initialRouteName: initial } };
}

function withoutNativeLinking<T>(run: () => T): T {
  const original: unknown = Reflect.get(Module, '_load');
  if (typeof original !== 'function') throw new Error('Node has no module loader to wrap.');
  const load = (request: string, ...rest: unknown[]): unknown => {
    if (request.endsWith('react-navigation/native')) return { validatePathConfig: () => undefined };
    const loaded: unknown = Reflect.apply(original, Module, [request, ...rest]);
    return loaded;
  };
  Reflect.set(Module, '_load', load);
  try {
    return run();
  } finally {
    Reflect.set(Module, '_load', original);
  }
}

const resolver = withoutNativeLinking(() => {
  const load = createRequire(join(BUILD, 'index.js'));
  const core: unknown = load('./getRoutesCore');
  const navigation: unknown = load('./getReactNavigationConfig');
  const linking: unknown = load('./fork/getStateFromPath');
  return { core, navigation, linking };
});

function call(module: unknown, name: string, args: readonly unknown[]): unknown {
  const fn: unknown =
    typeof module === 'object' && module !== null ? Reflect.get(module, name) : null;
  if (typeof fn !== 'function') throw new Error(`expo-router has no ${name}.`);
  return Reflect.apply(fn, module, args);
}

const keys = files(APP)
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => `./${relative(APP, file)}`);
const context = Object.assign(routeModule, {
  keys: () => keys,
  resolve: (key: string) => key,
  id: 'app',
});
const system = ({ route, type }: { readonly route: string; readonly type: string }): object => ({
  type,
  route,
  contextKey: 'system',
  generated: true,
  dynamic: null,
  children: [],
  loadRoute: () => ({ default: () => null }),
});
const routes = call(resolver.core, 'getRoutes', [
  context,
  {
    internal_stripLoadRoute: true,
    platform: 'android',
    skipGenerated: true,
    ignoreEntryPoints: true,
    getSystemRoute: system,
  },
]);
const screens = call(resolver.navigation, 'getReactNavigationConfig', [routes, false]);
const config = {
  screens: { __root: { path: '', ...(typeof screens === 'object' ? screens : {}) } },
};

function landing(path: string, from: readonly string[] = []): string {
  const names: string[] = [];
  let level = LEVEL.safeParse(
    call(resolver.linking, 'getStateFromPath', [path, config, from]),
  ).data;
  while (level !== undefined) {
    const route = level.routes[level.index ?? level.routes.length - 1];
    if (route === undefined) break;
    names.push(route.name);
    level = LEVEL.safeParse(route.state).data;
  }
  return names.slice(2).join(' > ');
}

function leafParams(path: string): unknown {
  let level = LEVEL.safeParse(call(resolver.linking, 'getStateFromPath', [path, config, []])).data;
  let params: unknown = null;
  while (level !== undefined) {
    const route = level.routes[level.index ?? level.routes.length - 1];
    if (route === undefined) break;
    params = Reflect.get(route, 'params');
    level = LEVEL.safeParse(route.state).data;
  }
  return params;
}

describe('fitness links', () => {
  it('open every section inside the Fitness tab section switcher', () => {
    expect(landing('/fitness')).toBe('(fitness) > fitness/(sections) > index');
    for (const section of ['activity', 'nutrition', 'heart', 'sleep', 'body', 'vitals']) {
      expect(landing(`/fitness/${section}`)).toBe(`(fitness) > fitness/(sections) > ${section}`);
    }
    expect(landing('/fitness/workouts')).toBe('(fitness) > fitness/(sections) > workouts/index');
  });

  it('keep detail pages as pushes on the Fitness stack', () => {
    expect(landing('/fitness/workouts/w1')).toBe('(fitness) > fitness/workouts/[workoutId]');
    expect(landing('/fitness/metric/steps')).toBe('(fitness) > fitness/metric/[metric]');
    expect(landing('/fitness/browse')).toBe('(fitness) > fitness/browse');
  });

  it('stay inside the assistant when opened from a chat', () => {
    const chat = ['(app)', '(z-assistant)', 'assistant/chat/[chatId]'];
    expect(landing('/fitness/activity', chat)).toBe('(z-assistant) > fitness/activity');
    expect(landing('/fitness/workouts', chat)).toBe('(z-assistant) > fitness/workouts/index');
    expect(landing('/fitness/metric/steps', chat)).toBe('(z-assistant) > fitness/metric/[metric]');
  });

  it('open the Fitness tab from any other tab', () => {
    expect(landing('/fitness/heart', ['(app)', '(home)', 'index'])).toBe(
      '(fitness) > fitness/(sections) > heart',
    );
  });

  it('carry the day and the start flag to the section they open', () => {
    expect(leafParams('/fitness/heart?day=2026-10-01')).toEqual({ day: '2026-10-01' });
    expect(leafParams('/fitness/workouts?start=1')).toEqual({ start: '1' });
  });
});
