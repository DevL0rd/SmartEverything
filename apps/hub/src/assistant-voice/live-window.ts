import { GOOGLE_MODELS, type AssistantSettings } from '@smarteverything/domain';
import type { LiveWindow } from './gemini';

const SLIDING_SHARE = 0.5;

export function liveWindow(settings: AssistantSettings): LiveWindow | null {
  const length = GOOGLE_MODELS.find(
    (model) => model.id === `google:${settings.voice.model}`,
  )?.contextLength;
  if (length === undefined || length === null) {
    return null;
  }
  return {
    triggerTokens: Math.floor((length * settings.compact_at_percent) / 100),
    targetTokens: Math.floor(length * SLIDING_SHARE),
  };
}
