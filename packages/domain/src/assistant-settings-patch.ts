import {
  ASSISTANT_SETTINGS_WRITE,
  type AssistantSettings,
  type AssistantSettingsChange,
} from './assistant';
import { DEFAULT_RESPONSE_STYLE } from './assistant-response-style';
export function patchAssistantSettings(
  settings: AssistantSettings,
  change: AssistantSettingsChange,
): AssistantSettings {
  return ASSISTANT_SETTINGS_WRITE.parse({
    ...settings,
    ...change,
    ...(change.response_style === undefined
      ? {}
      : {
          response_style: {
            ...DEFAULT_RESPONSE_STYLE,
            ...settings.response_style,
            ...change.response_style,
          },
        }),
  });
}
export function legacyAssistantSettings(settings: AssistantSettings): AssistantSettings {
  const { response_style: _style, ...legacy } = settings;
  return legacy;
}
