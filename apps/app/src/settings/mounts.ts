import type { Href } from 'expo-router';

export interface SettingsMount {
  readonly root: string;
  readonly owner: string;
  readonly ownerHref: Href;
  readonly base: string;
  readonly href: (rest: readonly string[], focus?: string) => Href;
}

function withFocus(focus: string | undefined): Readonly<Record<string, string>> {
  return focus === undefined ? {} : { focus };
}

export const SETTINGS_MOUNTS: readonly SettingsMount[] = [
  {
    root: 'talk',
    owner: 'Walkie-talkie',
    ownerHref: '/talk',
    base: 'talk/settings',
    href: (rest, focus) =>
      rest.length === 0
        ? { pathname: '/talk/settings', params: withFocus(focus) }
        : {
            pathname: '/talk/settings/[...page]',
            params: { ...withFocus(focus), page: [...rest] },
          },
  },
  {
    root: 'health',
    owner: 'Fitness',
    ownerHref: '/fitness',
    base: 'fitness/settings',
    href: (rest, focus) =>
      rest.length === 0
        ? { pathname: '/fitness/settings', params: withFocus(focus) }
        : {
            pathname: '/fitness/settings/[...page]',
            params: { ...withFocus(focus), page: [...rest] },
          },
  },
  {
    root: 'cameras',
    owner: 'Cameras',
    ownerHref: '/cameras',
    base: 'cameras/settings',
    href: (rest, focus) =>
      rest.length === 0
        ? { pathname: '/cameras/settings', params: withFocus(focus) }
        : {
            pathname: '/cameras/settings/[...page]',
            params: { ...withFocus(focus), page: [...rest] },
          },
  },
  {
    root: 'devices',
    owner: 'Devices',
    ownerHref: '/devices',
    base: 'devices/settings',
    href: (rest, focus) =>
      rest.length === 0
        ? { pathname: '/devices/settings', params: withFocus(focus) }
        : {
            pathname: '/devices/settings/[...page]',
            params: { ...withFocus(focus), page: [...rest] },
          },
  },
  {
    root: 'assistant',
    owner: 'Assistant',
    ownerHref: '/assistant',
    base: 'assistant/settings',
    href: (rest, focus) =>
      rest.length === 0
        ? { pathname: '/assistant/settings', params: withFocus(focus) }
        : {
            pathname: '/assistant/settings/[...page]',
            params: { ...withFocus(focus), page: [...rest] },
          },
  },
];

export function mountOf(id: string): SettingsMount | null {
  const root = id.split('/')[0];
  return SETTINGS_MOUNTS.find((mount) => mount.root === root) ?? null;
}

export function mountedHref(id: string, focus?: string): Href | null {
  const mount = mountOf(id);
  return mount === null ? null : mount.href(id.split('/').slice(1), focus);
}

export function settingsIdOfRoute(route: string): string | null {
  if (route === 'settings') {
    return 'home';
  }
  if (route.startsWith('settings/')) {
    return route.slice('settings/'.length);
  }
  const mount = SETTINGS_MOUNTS.find(
    (entry) => route === entry.base || route.startsWith(`${entry.base}/`),
  );
  return mount === undefined ? null : `${mount.root}${route.slice(mount.base.length)}`;
}
