import { createContext, use } from 'react';
import type { AutomationsList } from './use-list';

export const AutomationsListContext = createContext<AutomationsList | null>(null);

export function useListContext(): AutomationsList {
  const list = use(AutomationsListContext);
  if (list === null) {
    throw new Error('The automations list body needs an AutomationsListContext provider.');
  }
  return list;
}
