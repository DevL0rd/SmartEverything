import { useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import { useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AutomationProgramPatchReply,
  AutomationProgramReply,
  AutomationProgramRevisionSummary,
} from '@smarteverything/domain';
import { acceptedProgram } from '../../../api/automations';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { PatchOps, ProgramCheckBody, ProgramCreateBody, ProgramUpdateBody } from './api';
import { automationKeys } from './keys';
import type { AutomationRow } from './graph-adapter';
import {
  useAutomationsSource,
  type AutomationWriter,
  type AutomationsApi,
  type StoredAutomation,
} from './source';
import { useAutomationRow } from './use-automations';

export interface AutomationView {
  readonly row: AutomationRow | null;
  readonly revisions: UseQueryResult<AutomationProgramRevisionSummary[]>;
}

export function useAutomation(automationId: string): AutomationView {
  const { api } = useAutomationsSource();
  const row = useAutomationRow(automationId);
  const revisions = useScreenQuery({
    queryKey: automationKeys.revisions(automationId),
    queryFn: ({ signal }) => api.listRevisions(automationId, { signal }),
  });
  return { row, revisions };
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
  readonly rename: (automationId: string, name: string) => Promise<AutomationProgramReply>;
  readonly remove: (automationId: string) => Promise<void>;
  readonly duplicate: (
    automationId: string,
    body: ProgramCreateBody,
  ) => Promise<AutomationProgramReply>;
}

function shownActions(
  api: AutomationsApi,
  write: AutomationWriter,
  client: QueryClient,
): Pick<AutomationActions, 'setEnabled' | 'rename' | 'remove' | 'duplicate'> {
  return {
    setEnabled: (automationId, enabled) =>
      write({
        event: 'automation.enable',
        automationId,
        change: (row) => ({ ...row, enabled }),
        send: async () => acceptedProgram(await api.setProgramEnabled(automationId, enabled)),
      }),
    rename: async (automationId, name): Promise<AutomationProgramReply> => {
      const reply = await write({
        event: 'automation.rename',
        automationId,
        change: (row) => ({ ...row, name }),
        send: async () => acceptedProgram(await api.renameProgram(automationId, name)),
      });
      await client.invalidateQueries({ queryKey: automationKeys.draft(automationId) });
      return reply;
    },
    remove: async (automationId): Promise<void> => {
      await write({
        event: 'automation.remove',
        automationId,
        change: () => null,
        send: () => api.removeProgram(automationId),
      });
      client.removeQueries({ queryKey: automationKeys.draft(automationId) });
      client.removeQueries({ queryKey: automationKeys.revisions(automationId) });
    },
    duplicate: (automationId, body): Promise<AutomationProgramReply> => {
      const created = { ...body, id: randomUUID() };
      return write({
        event: 'automation.duplicate',
        automationId,
        change: (row) => row,
        added: (row) => copiedRow(row, created, new Date().toISOString()),
        send: () => api.createProgram(created),
      });
    },
  };
}

export function copiedRow(
  row: StoredAutomation,
  body: ProgramCreateBody & { readonly id: string },
  now: string,
): StoredAutomation {
  return {
    ...row,
    id: body.id,
    name: body.name,
    enabled: body.enabled ?? true,
    revision: 1,
    draft: null,
    origin: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: now,
    updated_at: now,
  };
}

export function useAutomationActions(): AutomationActions {
  const { api, write } = useAutomationsSource();
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
      ...shownActions(api, write, client),
    };
  }, [api, write, client]);
}
