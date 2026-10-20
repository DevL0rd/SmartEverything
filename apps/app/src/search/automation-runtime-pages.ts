import type { Href } from 'expo-router';
import {
  NODE_REGISTRY,
  type AutomationValueRow,
  type SearchSources,
} from '@smarteverything/domain';
import {
  automationRowsOf,
  automationSearchPages,
  valueFocusTargets,
  type AutomationFocusTarget,
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
function automationPages(tables: SearchTables): readonly RuntimePage[] {
  return automationSearchPages({
    automations: automationRowsOf(rowsOf(tables.automations)).rows,
    functions: [],
    secrets: [],
    kinds: NODE_REGISTRY.get,
  });
}
function runtimePages(tables: SearchTables): readonly RuntimePage[] {
  return [
    ...(tables.automationValues === undefined
      ? []
      : rowsOf(tables.automationValues).flatMap(valuePages)),
    ...automationPages(tables),
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
