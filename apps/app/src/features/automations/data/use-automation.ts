import { useMemo } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AutomationProgramPatchReply,
  AutomationProgramReply,
  AutomationProgramRevisionSummary,
  AutomationRowV3,
} from '@smarteverything/domain';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { PatchOps, ProgramCheckBody, ProgramCreateBody, ProgramUpdateBody } from './api';
import { automationKeys } from './keys';
import { useAutomationsSource } from './source';
import { useAutomations } from './use-automations';

export interface AutomationView {
  readonly row: AutomationRowV3 | null;
  readonly revisions: UseQueryResult<AutomationProgramRevisionSummary[]>;
}

export function useAutomation(automationId: string): AutomationView {
  const { api } = useAutomationsSource();
  const { byId } = useAutomations();
  const revisions = useScreenQuery({
    queryKey: automationKeys.revisions(automationId),
    queryFn: () => api.listRevisions(automationId),
  });
  return { row: byId.get(automationId) ?? null, revisions };
}

export interface AutomationActions {
  readonly create: (body: ProgramCreateBody) => Promise<AutomationProgramReply>;
  readonly update: (
    automationId: string,
    body: ProgramUpdateBody,
  ) => Promise<AutomationProgramReply>;
  readonly patch: (
    automationId: string,
    expectedRevision: number,
    ops: PatchOps,
  ) => Promise<AutomationProgramPatchReply>;
  readonly check: (body: ProgramCheckBody) => Promise<AutomationProgramReply>;
  readonly setEnabled: (automationId: string, enabled: boolean) => Promise<AutomationProgramReply>;
  readonly remove: (automationId: string) => Promise<void>;
}

export function useAutomationActions(): AutomationActions {
  const { api } = useAutomationsSource();
  const client = useQueryClient();
  return useMemo((): AutomationActions => {
    const changed = (automationId: string): Promise<void> =>
      Promise.all([
        client.invalidateQueries({ queryKey: automationKeys.revisions(automationId) }),
        client.invalidateQueries({ queryKey: automationKeys.draft(automationId) }),
      ]).then(() => undefined);
    return {
      create: api.createProgram,
      update: async (automationId, body): Promise<AutomationProgramReply> => {
        const reply = await api.updateProgram(automationId, body);
        await changed(automationId);
        return reply;
      },
      patch: async (automationId, expectedRevision, ops): Promise<AutomationProgramPatchReply> => {
        const reply = await api.patchProgram(automationId, expectedRevision, ops);
        await changed(automationId);
        return reply;
      },
      check: api.checkProgram,
      setEnabled: api.setProgramEnabled,
      remove: async (automationId): Promise<void> => {
        await api.removeProgram(automationId);
        client.removeQueries({ queryKey: automationKeys.draft(automationId) });
        client.removeQueries({ queryKey: automationKeys.revisions(automationId) });
      },
    };
  }, [api, client]);
}
