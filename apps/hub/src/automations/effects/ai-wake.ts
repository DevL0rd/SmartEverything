import type { AutomationAiSlot } from '../automation-ai';
import type { ActionOrigin } from '../automation-ai';
import { awaitRun } from './run-abort';
import type { EffectRun } from './effect-run';

export interface AiWakeRequest {
  readonly profileId: string;
  readonly chatId: string | null;
  readonly instruction: string;
}

export async function wakeAssistant(
  slot: Pick<AutomationAiSlot, 'current'>,
  request: AiWakeRequest,
  origin: ActionOrigin,
  run: EffectRun,
): Promise<void> {
  await awaitRun(slot.current().wake({ type: 'wake_ai', ...request }, origin), run);
}
