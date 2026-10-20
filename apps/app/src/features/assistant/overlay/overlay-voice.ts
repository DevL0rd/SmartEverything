import { Logger } from '@smarteverything/logging';
import type { OverlayVoice, VoiceThinkingLevel } from '@smarteverything/domain';
import { ValueStore } from '../../../design/external-store';
import type { EntityStore } from '../../../store/entity-store';
import type { StoreState } from '../../../store/state';
import { THINKING_SETTING } from '../settings/voice-thinking';

const log = new Logger('app.overlay');

interface ThinkingSave {
  readonly pending: number;
  readonly failed: boolean;
  readonly changedCall: string | null;
}

export const thinkingSave = new ValueStore<ThinkingSave>({
  pending: 0,
  failed: false,
  changedCall: null,
});

function change(part: Partial<ThinkingSave>): void {
  thinkingSave.update((save) => ({ ...save, ...part }));
}

export async function saveThinking(
  level: VoiceThinkingLevel,
  store: EntityStore,
  callId: string | null,
): Promise<void> {
  thinkingSave.update((save) => ({ ...save, pending: save.pending + 1, failed: false }));
  try {
    await THINKING_SETTING.write(level, { state: store.get(), store });
    if (callId !== null) change({ changedCall: callId });
  } catch (error: unknown) {
    log.warn('overlay.thinking_failed', { level, reason: String(error) });
    change({ failed: true });
  } finally {
    thinkingSave.update((save) => ({ ...save, pending: save.pending - 1 }));
  }
}

export function reconnected(): void {
  if (thinkingSave.get().changedCall !== null) change({ changedCall: null });
}

export function thinkingOf(state: StoreState): VoiceThinkingLevel | null {
  return state.assistant === null ? null : state.assistant.settings.voice.thinking_level;
}

export function overlayVoiceOf(
  level: VoiceThinkingLevel | null,
  save: ThinkingSave,
  callId: string | null,
): OverlayVoice | null {
  if (level === null) return null;
  return {
    thinking_level: level,
    saving: save.pending > 0,
    failed: save.failed,
    changedInCall: callId !== null && save.changedCall === callId,
  };
}
