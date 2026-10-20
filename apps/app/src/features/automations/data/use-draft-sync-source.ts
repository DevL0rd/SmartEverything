import { useMemo } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AutomationProgramComparison,
  AutomationProgramDraftView,
  AutomationProgramReply,
} from '@smarteverything/domain';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { DraftSaveBody, RevisionRow } from './api';
import { automationKeys } from './keys';
import { useAutomationsSource } from './source';

export interface DraftSyncSource {
  readonly draft: UseQueryResult<AutomationProgramDraftView>;
  readonly save: (body: DraftSaveBody) => Promise<AutomationProgramReply>;
  readonly discard: (expectedRevision: number) => Promise<AutomationProgramReply>;
  readonly publish: (expectedRevision: number) => Promise<AutomationProgramReply>;
  readonly revision: (revision: number) => Promise<RevisionRow>;
  readonly compare: (from: number, to: number | 'draft') => Promise<AutomationProgramComparison>;
}

export function useDraftSyncSource(automationId: string): DraftSyncSource {
  const { api } = useAutomationsSource();
  const client = useQueryClient();
  const draft = useScreenQuery({
    queryKey: automationKeys.draft(automationId),
    queryFn: () => api.getDraft(automationId),
    staleTime: Infinity,
    refetchOnMount: false,
  });
  const actions = useMemo((): Omit<DraftSyncSource, 'draft'> => {
    const settled = async (reply: AutomationProgramReply): Promise<AutomationProgramReply> => {
      if (reply.ok) {
        await Promise.all([
          client.invalidateQueries({ queryKey: automationKeys.draft(automationId) }),
          client.invalidateQueries({ queryKey: automationKeys.revisions(automationId) }),
        ]);
      }
      return reply;
    };
    return {
      save: (body: DraftSaveBody) => api.saveDraft(automationId, body),
      discard: async (expectedRevision: number) =>
        settled(await api.discardDraft(automationId, expectedRevision)),
      publish: async (expectedRevision: number) =>
        settled(await api.publishDraft(automationId, expectedRevision)),
      revision: (revision: number) =>
        client.query({
          queryKey: automationKeys.revision(automationId, revision),
          queryFn: () => api.getRevision(automationId, revision),
          staleTime: Infinity,
        }),
      compare: (from: number, to: number | 'draft') => api.compareRevisions(automationId, from, to),
    };
  }, [api, client, automationId]);
  return { draft, ...actions };
}
