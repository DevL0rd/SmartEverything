import type { AppHref } from '../../../components/app-href';
import type { AutomationRunSummary } from '@smarteverything/domain';
import type { DetailLinks } from '../detail/detail-screen';
import type { UseSlot } from '../detail/detail-model';
import type { ListLinks } from '../list/list-links';
import { links } from '../routes';

export function runHref(run: Pick<AutomationRunSummary, 'automation_id' | 'id'>): AppHref {
  return {
    pathname: '/automations/[automationId]/runs/[runId]',
    params: { automationId: run.automation_id, runId: run.id },
  };
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
};

const USE_LINKS: Partial<Record<UseSlot, (id: string) => AppHref>> = {
  automation: links.detail,
  function: links.node,
};

function useLink(slot: UseSlot, id: string): AppHref | null {
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
