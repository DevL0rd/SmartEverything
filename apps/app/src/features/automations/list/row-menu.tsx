import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import type { MenuItem } from '../../../components/menu';
import type { ListActions } from './list-actions';
import type { ListEntry } from './list-entries';
import type { ListLinks } from './list-links';

type Go = (href: Href) => void;

function openItems(entry: ListEntry, links: ListLinks, go: Go): readonly MenuItem[] {
  return [
    {
      label: 'Open',
      icon: 'automations',
      onPress: (): void => {
        go(links.open(entry.id));
      },
    },
    {
      label: 'Edit',
      icon: 'pencil',
      onPress: (): void => {
        go(links.edit(entry.id));
      },
    },
    {
      label: 'Run history',
      icon: 'activity',
      onPress: (): void => {
        go(links.runs(entry.id));
      },
    },
  ];
}

function runItems(entry: ListEntry, actions: ListActions): readonly MenuItem[] {
  return [
    {
      label: 'Run test',
      icon: 'play',
      onPress: (): void => {
        actions.run(entry.id, 'dry');
      },
    },
    {
      label: 'Run for real',
      icon: 'play',
      disabled: !entry.enabled,
      onPress: (): void => {
        actions.run(entry.id, 'live');
      },
    },
  ];
}

function changeItems(entry: ListEntry, actions: ListActions): readonly MenuItem[] {
  return [
    {
      label: 'Duplicate',
      icon: 'copy',
      onPress: (): void => {
        actions.duplicate(entry.id);
      },
    },
    {
      label: entry.enabled ? 'Pause' : 'Resume',
      icon: entry.enabled ? 'pause' : 'play',
      onPress: (): void => {
        actions.toggle(entry.id, !entry.enabled);
      },
    },
    {
      label: 'Delete',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        actions.remove(entry.id, entry.name);
      },
    },
  ];
}

export function rowMenuItems(
  entry: ListEntry,
  links: ListLinks,
  actions: ListActions,
  go: Go,
): readonly MenuItem[] {
  return [
    ...openItems(entry, links, go),
    ...runItems(entry, actions),
    ...changeItems(entry, actions),
  ];
}

export function useRowMenu(
  entry: ListEntry,
  links: ListLinks,
  actions: ListActions,
): readonly MenuItem[] {
  const router = useRouter();
  return rowMenuItems(entry, links, actions, (href) => {
    router.push(href);
  });
}
