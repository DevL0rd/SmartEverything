import { Logger } from '@smarteverything/logging';
import type { AssistantSettingsChange } from '@smarteverything/domain';
import { updateAssistantSettings } from '../../../api/assistant';
import type { SettingContext } from '../../../settings/types';
import type { StoreState } from '../../../store/state';

const log = new Logger('app.settings');
export const owner = (env: { readonly owner: boolean }): boolean => env.owner;

export const known = (state: StoreState): boolean => state.assistant !== null;

export async function writeAssistant(
  change: AssistantSettingsChange,
  context: SettingContext,
): Promise<void> {
  const operation = log.operation('assistant_settings.write', {
    keys: Object.keys(change).join(','),
  });
  try {
    const status = await updateAssistantSettings(change);
    context.store.update((state) => ({ ...state, assistant: status }));
    operation.succeeded();
  } catch (error) {
    operation.failed(error);
    throw error;
  }
}

export function writeVoice(
  change: NonNullable<AssistantSettingsChange['voice']>,
  context: SettingContext,
): Promise<void> {
  return writeAssistant({ voice: change }, context);
}
