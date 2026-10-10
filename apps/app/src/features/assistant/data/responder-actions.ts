import type {
  AssistantSettingsChange,
  AssistantStatus,
  ResponderApp,
} from '@smarteverything/domain';
import {
  connectAssistantApp,
  disconnectAssistantApp,
  updateAssistantSettings,
} from '../../../api/assistant';
import { notify } from '../../../components/toast-store';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';

export interface ResponderActions {
  readonly connect: (app: ResponderApp) => Promise<boolean>;
  readonly disconnect: (app: ResponderApp) => Promise<boolean>;
  readonly change: (change: AssistantSettingsChange, what: string) => Promise<boolean>;
}

async function applied(
  store: EntityStore,
  work: () => Promise<AssistantStatus>,
  failure: string,
): Promise<boolean> {
  try {
    const status = await work();
    store.update((state) => ({ ...state, assistant: status }));
    return true;
  } catch (error) {
    notify({ message: failure, error, tone: 'critical' });
    return false;
  }
}

export function useResponderActions(): ResponderActions {
  const store = useEntityStore();
  return {
    connect: (app) => applied(store, () => connectAssistantApp(app), 'Couldn’t connect'),
    disconnect: (app) => applied(store, () => disconnectAssistantApp(app), 'Couldn’t disconnect'),
    change: (change, what) =>
      applied(store, () => updateAssistantSettings(change), `${what} not changed`),
  };
}
