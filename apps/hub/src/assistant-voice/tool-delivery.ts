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

function recordAndShow(to: ToolDelivery, answer: ToolAnswer): void {
  if (answer.line !== '') {
    to.record({
      who: 'tool',
      text: answer.line,
      ok: !('error' in answer.response),
      detail: errorOf(answer.response),
    });
  }
  for (const picture of answer.pictures) {
    to.session?.picture(picture);
  }
}

export function deliverToolAnswer(to: ToolDelivery, call: ToolCallRef, answer: ToolAnswer): void {
  recordAndShow(to, answer);
  to.session?.toolResult(call.id, call.name, withPhotoNote(answer), {
    scheduling: to.scheduling,
    more: false,
  });
}

export function deliverLateAnswer(to: ToolDelivery, call: ToolCallRef, answer: ToolAnswer): void {
  recordAndShow(to, answer);
  const result = JSON.stringify(withPhotoNote(answer));
  to.session?.text(
    `[${call.name}, which you called before your connection was renewed, returned: ${result}]`,
    true,
  );
}
