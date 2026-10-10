import type { RecordedTurn } from './call-record';
import type { AssistantVoiceSettings } from '@smarteverything/domain';
import type { LiveSession, ToolScheduling } from './gemini';
import { errorOf, type ToolAnswer } from './tool-answer';

export interface ToolCallRef {
  readonly id: string;
  readonly name: string;
}

function withPhotoNote(answer: ToolAnswer): Readonly<Record<string, unknown>> {
  const count = answer.pictures.length;
  if (count === 0) {
    return answer.response;
  }
  const photos =
    count === 1
      ? 'the picture sent just before this result'
      : `the ${String(count)} pictures sent just before this result, in order`;
  return { ...answer.response, photos: `Look at ${photos}; describe what you see in it.` };
}

export function timingOf(settings: AssistantVoiceSettings): ToolScheduling {
  return settings.result_timing === 'immediately' ? 'interrupt' : 'idle';
}

export interface ToolDelivery {
  readonly session: LiveSession | null;
  readonly record: (turn: RecordedTurn) => void;
  readonly scheduling: ToolScheduling;
}

export function deliverToolAnswer(to: ToolDelivery, call: ToolCallRef, answer: ToolAnswer): void {
  const { session, record, scheduling } = to;
  if (answer.line !== '') {
    record({
      who: 'tool',
      text: answer.line,
      ok: !('error' in answer.response),
      detail: errorOf(answer.response),
    });
  }
  for (const picture of answer.pictures) {
    session?.picture(picture);
  }
  session?.toolResult(call.id, call.name, withPhotoNote(answer), { scheduling, more: false });
}
