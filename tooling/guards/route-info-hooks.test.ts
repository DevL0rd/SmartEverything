import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applicationRoutes, applicationSource, filesUnder, insideApp } from './repository-files';

const ROUTE_INFO_HOOK =
  /\b(useSegments|usePathname|useGlobalSearchParams|useRootNavigationState|useRouteInfo)\(/;

const ONE_INSTANCE: Readonly<Record<string, string>> = {
  'app/+not-found.tsx': 'rendered only for an unknown route',
  'src/app-shell/natural-tab.ts': 'the shell tab bar, mounted once',
  'src/app-shell/root-presentation.ts': 'the shell layout, mounted once',
  'src/app-shell/use-nav-model.ts': 'the shell tab bar, mounted once',
  'src/app-shell/pin-menu.ts':
    'the shell page-pin tracker, mounted once; headers read a store and build the pin item only when their menu opens',
  'src/app-shell/settings-navigation.ts':
    'settings page frames read whether Settings was opened from another tab; settings remounts on every visit',
  'src/features/root/crash-trail-host.tsx': 'a root host, mounted once',
  'src/features/connections/consent/consent-host.tsx': 'a global host, mounted once',
  'src/features/connections/flows/tuya-handoff.tsx': 'inside the consent host, mounted once',
  'src/features/assistant/browser/browser-runtime-host.tsx': 'a global host, mounted once',
  'src/features/assistant/overlay/overlay-surface.ts': 'used by the overlay host, mounted once',
  'src/settings/settings-nav.tsx':
    'the settings master pane highlights the open page; settings remounts on every visit',
  'src/perf/perf-host.tsx': 'the dev profiler host, mounted once',
  'src/dev/profiling-host.tsx': 'the dev profiling host, mounted once',
};

const sources = [...filesUnder(applicationSource), ...filesUnder(applicationRoutes)].filter(
  (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.includes('test-support'),
);

describe('global route subscriptions', () => {
  it('only single-instance hosts subscribe to the global route, so navigation does not re-render every mounted screen', () => {
    const subscribers = sources
      .filter((file) => ROUTE_INFO_HOOK.test(readFileSync(file, 'utf8')))
      .map(insideApp)
      .filter((file) => !(file in ONE_INSTANCE));
    expect(subscribers).toEqual([]);
  });

  it('every listed host still subscribes', () => {
    const subscribing = new Set(
      sources.filter((file) => ROUTE_INFO_HOOK.test(readFileSync(file, 'utf8'))).map(insideApp),
    );
    expect(Object.keys(ONE_INSTANCE).filter((file) => !subscribing.has(file))).toEqual([]);
  });
});
