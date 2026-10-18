import type { Href } from 'expo-router';
import type { AutomationRow, AutomationValueRow, SearchSources } from '@smarteverything/domain';
import {
  storedFocusTargets,
  valueFocusTargets,
  type AutomationFocusTarget,
  type AutomationNames,
} from '../features/automations';
import { href } from '../app-shell/hrefs';
import { rowsOf } from '../store/state';
import type { IconName } from '../components/icon';
import type { SearchTables, SourceLinks } from './sources';

interface RuntimePage {
  readonly path: string;
  readonly title: string;
  readonly parent: string;
  readonly to: Href;
  readonly icon: IconName;
  readonly keywords: readonly string[];
}
interface FocusPages {
  readonly base: string;
  readonly parent: string;
  readonly targets: readonly AutomationFocusTarget[];
  readonly link: (focus: string) => Href;
}
function focusPages({ base, parent, targets, link }: FocusPages): readonly RuntimePage[] {
  return targets.map((target) => ({
    path: `${base}:${target.key}`,
    title: target.title,
    parent: target.parent === null ? parent : `page:${base}:${target.parent}`,
    to: link(target.focus),
    icon: 'customize',
    keywords: target.keywords,
  }));
}
function namesOf(tables: SearchTables): AutomationNames {
  return {
    devices: rowsOf(tables.devices),
    scenes: rowsOf(tables.scenes),
    people: [],
    chats: tables.chats,
    values: tables.automationValues === undefined ? [] : rowsOf(tables.automationValues),
    automations: rowsOf(tables.automations),
    groups: rowsOf(tables.deviceGroups),
    rooms: rowsOf(tables.rooms),
  };
}
function valuePages(row: AutomationValueRow): readonly RuntimePage[] {
  const base = `automation-value:${row.id}`;
  return [
    {
      path: base,
      title: row.content.name,
      parent: 'page:automations.values',
      to: href.automationValue(row.id),
      icon: 'customize',
      keywords: [
        'value',
        'variable',
        'edit',
        row.content.kind,
        'set',
        'toggle',
        'add',
        'subtract',
        'cycle',
        'next',
        'previous',
        'bounds',
        'wrap',
      ],
    },
    ...focusPages({
      base,
      parent: `page:${base}`,
      targets: valueFocusTargets(row.content),
      link: (focus) => href.automationValue(row.id, focus),
    }),
  ];
}
function automationPages(row: AutomationRow, names: AutomationNames): readonly RuntimePage[] {
  const stored = storedFocusTargets(row, names);
  if (stored === null) return [];
  return focusPages({
    base: `automation-editor:${row.id}`,
    parent: `automation:${row.id}`,
    targets: stored.targets,
    link: (focus) =>
      stored.reusable
        ? href.automationSequence(row.id, focus)
        : href.automation(row.id, undefined, focus),
  });
}
function runtimePages(tables: SearchTables): readonly RuntimePage[] {
  const names = namesOf(tables);
  return [
    ...(tables.automationValues === undefined
      ? []
      : rowsOf(tables.automationValues).flatMap(valuePages)),
    ...rowsOf(tables.automations).flatMap((row) => automationPages(row, names)),
  ];
}
export function automationRuntimePages(
  tables: SearchTables,
  out: SourceLinks,
): SearchSources['pages'] {
  return runtimePages(tables).map(({ path, title, parent, to, icon, keywords }) => {
    out.links.set(`page:${path}`, to);
    out.icons.set(`page:${path}`, icon);
    out.parents.set(`page:${path}`, parent);
    return { path, title, description: 'Automations', keywords };
  });
}
