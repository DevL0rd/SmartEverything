import { assistantLabel, type AssistantStatus } from '@smarteverything/domain';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';

export function useAssistantStatus(): AssistantStatus | null {
  return useStoreSelector((state) => state.assistant);
}

const selectAssistantName = (state: StoreState): string =>
  state.assistant === null ? 'Assistant' : assistantLabel(state.assistant.settings);

export function useAssistantName(): string {
  return useStoreSelector(selectAssistantName);
}
