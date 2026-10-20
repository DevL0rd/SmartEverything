import type { Href } from 'expo-router';
import type { AutomationRunSummary } from '@smarteverything/domain';
import type { DetailLinks } from '../detail/detail-screen';
import type { UseSlot } from '../detail/detail-model';
import type { ListLinks } from '../list/list-links';
import { links } from '../routes';

export function runHref(run: Pick<AutomationRunSummary, 'automation_id' | 'id'>): Href {
  return {
    pathname: '/automations/[automationId]/runs/[runId]',
    params: { automationId: run.automation_id, runId: run.id },
  };
}

export function isEditorPath(pathname: string): boolean {
  return /^\/automations\/(?:nodes\/)?[^/]+\/edit\/?$/.test(pathname);
}

export function runPageTitle(automationName: string | null): string {
  return automationName === null ? 'Run' : `${automationName} run`;
}

export const LIST_LINKS: ListLinks = {
  open: links.detail,
  edit: (automationId) => links.edit(automationId),
  runs: (automationId) => ({
    pathname: '/automations/[automationId]/runs',
    params: { automationId },
  }),
  workspace: [
    { id: 'automations', label: 'Automations', icon: 'automations', href: links.list() },
    { id: 'nodes', label: 'Custom Nodes', icon: 'box', href: links.nodes() },
    { id: 'templates', label: 'Templates', icon: 'layers', href: links.templates() },
    { id: 'runs', label: 'Runs', icon: 'activity', href: links.runs() },
    { id: 'variables', label: 'Variables', icon: 'customize', href: links.variables() },
    { id: 'schedule', label: 'Schedule', icon: 'calendar', href: links.schedule() },
  ],
  extras: [
    { id: 'scenes', label: 'Scenes', icon: 'sparkles', href: links.scenes() },
    { id: 'timers', label: 'Timers', icon: 'timer', href: links.scheduled() },
  ],
};

const USE_LINKS: Partial<Record<UseSlot, (id: string) => Href>> = {
  automation: links.detail,
  function: links.node,
};

function useLink(slot: UseSlot, id: string): Href | null {
  return USE_LINKS[slot]?.(id) ?? null;
}

export function detailLinks(automationId: string): DetailLinks {
  return {
    list: links.list(),
    edit: (nodeId) => links.edit(automationId, nodeId === null ? undefined : `node:${nodeId}`),
    runs: LIST_LINKS.runs(automationId),
    use: useLink,
  };
}
