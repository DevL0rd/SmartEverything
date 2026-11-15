import type { AppHref } from '../../../components/app-href';
import type { IconName } from '../../../components/icon';
import type { RailEntry } from '../../../components/page-shell/section-rail';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import { links } from '../routes';

export type WorkspaceSection =
  'automations' | 'nodes' | 'templates' | 'runs' | 'variables' | 'schedule' | 'timers';

interface WorkspaceLink {
  readonly id: WorkspaceSection;
  readonly label: string;
  readonly short?: string;
  readonly icon: IconName;
  readonly href: AppHref;
}

const WORKSPACE: readonly WorkspaceLink[] = [
  { id: 'automations', label: 'Automations', icon: 'automations', href: links.list() },
  { id: 'nodes', label: 'Custom Nodes', short: 'Nodes', icon: 'box', href: links.nodes() },
  { id: 'templates', label: 'Templates', icon: 'layers', href: links.templates() },
  { id: 'runs', label: 'Runs', icon: 'activity', href: links.runs() },
  { id: 'variables', label: 'Variables', icon: 'customize', href: links.variables() },
  { id: 'schedule', label: 'Schedule', icon: 'calendar', href: links.schedule() },
  { id: 'timers', label: 'Timers', icon: 'timer', href: links.scheduled() },
];

function entryOf(link: WorkspaceLink): RailEntry {
  return { id: link.id, label: link.label, short: link.short, icon: link.icon, missing: null };
}

export function workspaceHrefOf(id: string): AppHref {
  const link = WORKSPACE.find((entry) => entry.id === id);
  if (link === undefined) throw new Error(`No automation workspace section is called ${id}.`);
  return link.href;
}

export function workspaceSectionsOf(active: WorkspaceSection): ShellSections {
  return {
    label: 'Automation workspace',
    active,
    hrefOf: workspaceHrefOf,
    navigation: 'replace',
    groups: [{ title: null, entries: WORKSPACE.map(entryOf) }],
  };
}
