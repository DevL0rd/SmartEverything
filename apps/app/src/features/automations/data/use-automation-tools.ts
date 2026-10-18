import type { UseQueryResult } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type AutomationToolRow } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';

const AUTOMATION_TOOLS_KEY = ['window', 'automation-tools'] as const;

export function useAutomationTools(): UseQueryResult<AutomationToolRow[]> {
  return useScreenQuery({
    queryKey: AUTOMATION_TOOLS_KEY,
    queryFn: () => api().call(E.listAutomationTools, {}),
  });
}
