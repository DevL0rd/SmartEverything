interface SettingsMount {
  readonly root: string;
  readonly base: string;
}

const SETTINGS_MOUNTS: readonly SettingsMount[] = [
  { root: 'talk', base: 'talk/settings' },
  { root: 'health', base: 'fitness/settings' },
  { root: 'cameras', base: 'cameras/settings' },
  { root: 'devices', base: 'devices/settings' },
];

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
