import type { PhoneDetail } from '@smarteverything/domain';

type NotificationsSection = NonNullable<PhoneDetail['notifications']>;

export interface NotificationGroup {
  readonly package: string;
  readonly label: string;
  readonly count: number;
  readonly items: readonly NotificationItem[];
}

export interface NotificationItem {
  readonly key: string;
  readonly title: string | null;
  readonly at: string;
}

export interface CountEntry {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly share: number;
}

export type NotificationRow =
  | { readonly kind: 'group'; readonly group: NotificationGroup }
  | { readonly kind: 'item'; readonly group: NotificationGroup; readonly item: NotificationItem };

export function countEntriesOf(section: NotificationsSection): readonly CountEntry[] {
  const ranked = [...section.apps].sort((a, b) => b.count - a.count);
  const top = ranked[0]?.count ?? 1;
  return ranked.map((app) => ({
    key: app.package,
    label: app.label,
    count: app.count,
    share: app.count / top,
  }));
}

export function groupsOf(section: NotificationsSection): readonly NotificationGroup[] {
  const items = section.items ?? [];
  return [...section.apps]
    .sort((a, b) => b.count - a.count)
    .map((app) => ({
      package: app.package,
      label: app.label,
      count: app.count,
      items: items
        .filter((item) => item.package === app.package)
        .map((item) => ({ key: item.key, title: item.title, at: item.at }))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    }))
    .filter((group) => group.count > 0 || group.items.length > 0);
}

export function rowsOf(groups: readonly NotificationGroup[]): readonly NotificationRow[] {
  return groups.flatMap((group): readonly NotificationRow[] => [
    { kind: 'group', group },
    ...group.items.map((item): NotificationRow => ({ kind: 'item', group, item })),
  ]);
}

export function countSpoken(count: number, apps: number): string {
  const noun = count === 1 ? 'notification' : 'notifications';
  if (apps === 0) return `${String(count)} ${noun}`;
  return `${String(count)} ${noun} from ${String(apps)} ${apps === 1 ? 'app' : 'apps'}`;
}
