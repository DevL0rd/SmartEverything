import { useMemo } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { AutomationSecretEntry } from '@smarteverything/domain';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { SecretBody } from './api';
import { automationKeys } from './keys';
import { useAutomationsSource } from './source';

export function useSecrets(enabled: boolean): UseQueryResult<AutomationSecretEntry[]> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: automationKeys.secrets(),
    queryFn: api.listSecrets,
    enabled,
  });
}

export interface SecretActions {
  readonly set: (body: SecretBody) => Promise<AutomationSecretEntry>;
  readonly remove: (secretId: string) => Promise<void>;
}

export function useSecretActions(): SecretActions {
  const { api } = useAutomationsSource();
  const client = useQueryClient();
  return useMemo(
    (): SecretActions => ({
      set: async (body): Promise<AutomationSecretEntry> => {
        const entry = await api.setSecret(body);
        await client.invalidateQueries({ queryKey: automationKeys.secrets() });
        return entry;
      },
      remove: async (secretId): Promise<void> => {
        await api.removeSecret(secretId);
        await client.invalidateQueries({ queryKey: automationKeys.secrets() });
      },
    }),
    [api, client],
  );
}
