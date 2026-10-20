import { useMemo } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AutomationFunctionCallersReply,
  AutomationFunctionDetail,
  AutomationFunctionExtractReply,
  AutomationFunctionReply,
  AutomationFunctionSummary,
} from '@smarteverything/domain';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type {
  FunctionCallersBody,
  FunctionCreateBody,
  FunctionExtractBody,
  FunctionSaveBody,
} from './api';
import { automationKeys } from './keys';
import { useAutomationsSource } from './source';

export function useFunctions(): UseQueryResult<AutomationFunctionSummary[]> {
  const { api } = useAutomationsSource();
  return useScreenQuery({ queryKey: automationKeys.functions(), queryFn: api.listFunctions });
}

export function useFunction(functionId: string): UseQueryResult<AutomationFunctionDetail> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: automationKeys.function(functionId),
    queryFn: () => api.getFunction(functionId),
  });
}

export interface FunctionActions {
  readonly create: (body: FunctionCreateBody) => Promise<AutomationFunctionReply>;
  readonly save: (functionId: string, body: FunctionSaveBody) => Promise<AutomationFunctionReply>;
  readonly updateCallers: (
    functionId: string,
    body: FunctionCallersBody,
  ) => Promise<AutomationFunctionCallersReply>;
  readonly extract: (body: FunctionExtractBody) => Promise<AutomationFunctionExtractReply>;
  readonly remove: (functionId: string) => Promise<void>;
}

export function useFunctionActions(): FunctionActions {
  const { api } = useAutomationsSource();
  const client = useQueryClient();
  return useMemo((): FunctionActions => {
    const changed = async (functionId?: string): Promise<void> => {
      await client.invalidateQueries({ queryKey: automationKeys.functions() });
      if (functionId !== undefined) {
        await client.invalidateQueries({ queryKey: automationKeys.function(functionId) });
      }
    };
    return {
      create: async (body): Promise<AutomationFunctionReply> => {
        const reply = await api.createFunction(body);
        await changed();
        return reply;
      },
      save: async (functionId, body): Promise<AutomationFunctionReply> => {
        const reply = await api.saveFunction(functionId, body);
        await changed(functionId);
        return reply;
      },
      updateCallers: async (functionId, body): Promise<AutomationFunctionCallersReply> => {
        const reply = await api.updateFunctionCallers(functionId, body);
        await changed(functionId);
        await client.invalidateQueries({ queryKey: [...automationKeys.all, 'draft'] });
        return reply;
      },
      extract: async (body): Promise<AutomationFunctionExtractReply> => {
        const reply = await api.extractFunction(body);
        await changed();
        await client.invalidateQueries({ queryKey: automationKeys.draft(body.automationId) });
        return reply;
      },
      remove: async (functionId): Promise<void> => {
        await api.removeFunction(functionId);
        client.removeQueries({ queryKey: automationKeys.function(functionId) });
        await changed();
      },
    };
  }, [api, client]);
}
