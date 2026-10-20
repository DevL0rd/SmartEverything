import type { PhoneDetail } from '@smarteverything/domain';

export const MOST_TOP_APPS = 5;

export interface TopApp {
  readonly package: string;
  readonly label: string;
  readonly iconHash: string | null;
  readonly minutes: number;
  readonly share: number;
}

export function topAppsOf(section: PhoneDetail['apps']): readonly TopApp[] {
  if (section === undefined) return [];
  const used = [...section.usage]
    .filter((usage) => usage.minutesToday > 0)
    .sort((a, b) => b.minutesToday - a.minutesToday)
    .slice(0, MOST_TOP_APPS);
  const most = used[0]?.minutesToday ?? 1;
  return used.map((usage) => {
    const app = section.installed.find((entry) => entry.package === usage.package);
    return {
      package: usage.package,
      label: app?.label ?? usage.package,
      iconHash: app?.iconHash ?? null,
      minutes: usage.minutesToday,
      share: usage.minutesToday / most,
    };
  });
}
