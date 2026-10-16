import type { Href } from 'expo-router';
import {
  AUTOMATION_DEFINITION,
  type AutomationRow,
  type AutomationValueRow,
  type AutomationSequenceRow,
  type SearchSources,
} from '@smarteverything/domain';
import {
  automationFocusTargets,
  sequenceFocusTargets,
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
    sequences: tables.automationSequences === undefined ? [] : rowsOf(tables.automationSequences),
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
function sequencePages(row: AutomationSequenceRow, names: AutomationNames): readonly RuntimePage[] {
  const base = `automation-sequence:${row.id}`;
  return [
    {
      path: base,
      title: row.name,
      parent: 'page:automations.sequences',
      to: href.automationSequence(row.id),
      icon: 'layers',
      keywords: [
        'sequence',
        'parameters',
        'reusable',
        'steps',
        'run',
        'test',
        'stop',
        'history',
        'single',
        'restart',
        'queue',
        'parallel',
      ],
    },
    ...focusPages({
      base,
      parent: `page:${base}`,
      targets: sequenceFocusTargets(row.definition, names),
      link: (focus) => href.automationSequence(row.id, focus),
    }),
  ];
}
function automationPages(row: AutomationRow, names: AutomationNames): readonly RuntimePage[] {
  const parsed = AUTOMATION_DEFINITION.safeParse(row.definition);
  return parsed.success
    ? focusPages({
        base: `automation-editor:${row.id}`,
        parent: `automation:${row.id}`,
        targets: automationFocusTargets(parsed.data, names),
        link: (focus) => href.automation(row.id, undefined, focus),
      })
    : [];
}
function runtimePages(tables: SearchTables): readonly RuntimePage[] {
  const names = namesOf(tables);
  return [
    ...(tables.automationValues === undefined
      ? []
      : rowsOf(tables.automationValues).flatMap(valuePages)),
    ...(tables.automationSequences === undefined
      ? []
      : rowsOf(tables.automationSequences).flatMap((row) => sequencePages(row, names))),
    ...rowsOf(tables.automations).flatMap((row) => automationPages(row, names)),
    ...runPages(tables),
  ];
}
function runPages(tables: SearchTables): readonly RuntimePage[] {
  const runs = tables.automationRuns === undefined ? [] : rowsOf(tables.automationRuns);
  return runs.map((row) => ({
    path: `automation-run:${row.id}`,
    title: `Run · ${row.status} · ${new Date(row.created_at).toLocaleString()}`,
    parent:
      row.target_type === 'sequence'
        ? `page:automation-sequence:${row.automation_id}`
        : `automation:${row.automation_id}`,
    to:
      row.target_type === 'sequence'
        ? href.automationSequence(row.automation_id, `run:${row.id}`)
        : href.automationRuns(row.automation_id, `run:${row.id}`),
    icon: 'activity',
    keywords: ['run', 'history', 'trace', 'status', 'stop', row.status, row.id],
  }));
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
