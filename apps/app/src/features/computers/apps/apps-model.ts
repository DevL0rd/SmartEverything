import {
  MachineOpenTargetError,
  machineOpenTargetOf,
  type AppUsage,
  type ComputerApps,
  type InstalledApp,
} from '@smarteverything/domain';
import { duration } from '../../../format/time';
import { compareText } from '../../../format/text';

export interface UsedApp {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly running: boolean;
}

const SHELL_PREFIXES: readonly string[] = [
  'org.kde.plasma',
  'org.kde.krunner',
  'org.kde.kwin',
  'org.gnome.Shell',
];
const MIN_USED_SECONDS = 60;

function isShell(id: string): boolean {
  return SHELL_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function usedApps(apps: ComputerApps, running: ReadonlySet<string>): readonly UsedApp[] {
  const focused: readonly UsedApp[] =
    apps.focused === null || isShell(apps.focused.id)
      ? []
      : [{ id: apps.focused.id, name: apps.focused.name, line: 'In front now', running: true }];
  const seen = new Set(focused.map((app) => app.id));
  const earlier = apps.today
    .filter(
      (app: AppUsage) =>
        !seen.has(app.appId) && !isShell(app.appId) && app.seconds >= MIN_USED_SECONDS,
    )
    .map((app) => {
      const today = `${duration(app.seconds)} today`;
      const open = running.has(app.appId);
      return {
        id: app.appId,
        name: app.name,
        line: open ? `Open · ${today}` : today,
        running: open,
      };
    });
  return [...focused, ...earlier];
}

export function matchingInstalled(
  installed: readonly InstalledApp[],
  query: string,
): readonly InstalledApp[] {
  const needle = query.trim().toLowerCase();
  const shown =
    needle === ''
      ? installed
      : installed.filter((app) =>
          `${app.name} ${app.comment ?? ''}`.toLowerCase().includes(needle),
        );
  return [...shown].sort((left, right) => compareText(left.name, right.name));
}

export function runningIds(
  windows: readonly { readonly app: { readonly id: string } | null }[] | undefined,
  focused: string | null,
): ReadonlySet<string> {
  const ids = new Set(
    (windows ?? []).flatMap((window) => (window.app === null ? [] : [window.app.id])),
  );
  if (focused !== null) ids.add(focused);
  return ids;
}

const DESKTOP_NUMBERS = /^\d+(, \d+)*$/;

export function desktopLabel(desktop: string): string {
  if (!DESKTOP_NUMBERS.test(desktop)) return desktop;
  return `${desktop.includes(',') ? 'Desktops' : 'Desktop'} ${desktop}`;
}

export function windowLine(window: {
  readonly app: { readonly name: string } | null;
  readonly desktop: string | null;
  readonly minimised: boolean;
  readonly focused: boolean;
}): string {
  return [
    window.app?.name ?? null,
    window.desktop === null ? null : desktopLabel(window.desktop),
    window.focused ? 'In front' : null,
    window.minimised ? 'Minimised' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

export function openTargetError(text: string): string | null {
  try {
    machineOpenTargetOf(text);
    return null;
  } catch (cause) {
    if (cause instanceof MachineOpenTargetError) {
      return 'Enter a web, mail or phone link, or an absolute file path.';
    }
    throw cause;
  }
}
