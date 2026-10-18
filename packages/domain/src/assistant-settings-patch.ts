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
  const { voice, response_style: style, ...fields } = change;
  return ASSISTANT_SETTINGS_WRITE.parse({
    ...settings,
    ...fields,
    voice: { ...settings.voice, ...voice },
    ...(style === undefined
      ? {}
      : { response_style: { ...DEFAULT_RESPONSE_STYLE, ...settings.response_style, ...style } }),
  });
}
export function legacyAssistantSettings(settings: AssistantSettings): AssistantSettings {
  const { response_style: _style, ...legacy } = settings;
  return legacy;
}
