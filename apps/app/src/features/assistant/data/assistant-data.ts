import { assistantLabel, type AssistantStatus } from '@smarteverything/domain';
import { awaitingHubDeploy } from '../../../store/live-sync';
import { useSyncStatus } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';

export type ChatState =
  | { readonly kind: 'update-hub' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'ready'; readonly status: AssistantStatus };

export function useAssistantStatus(): AssistantStatus | null {
  return useStoreSelector((state) => state.assistant);
}

export function useAssistantName(): string {
  const status = useAssistantStatus();
  return status === null ? 'Assistant' : assistantLabel(status.settings);
}

function chatStateOf(status: AssistantStatus | null, live: boolean): ChatState {
  if (awaitingHubDeploy('assistant') || (status === null && live)) {
    return { kind: 'update-hub' };
  }
  if (status === null) {
    return { kind: 'offline' };
  }
  return { kind: 'ready', status };
}

export function useChatState(): ChatState {
  const status = useAssistantStatus();
  const live = useSyncStatus().status === 'live';
  return chatStateOf(status, live);
}
