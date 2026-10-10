import { toolCallerOf, type Call, type CallDeskOptions, type SightBudget } from './call-parts';
import { recordTurn } from './call-hooks';
import { CallSight } from './call-sight';
import { VOICE_TOOL_NAMES } from './voice-tools';

export function callSightOf(
  options: CallDeskOptions,
  callId: string,
  call: () => Call,
  budget: () => SightBudget | null,
): CallSight {
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: options.store.settings.read().time_zone,
    hour: '2-digit',
    minute: '2-digit',
  });
  return new CallSight({
    callId,
    send: (message): void => {
      call().endpoint.send(message);
    },
    video: (frame): void => {
      call().conversation.video(frame);
    },
    note: (text, picture, respond): void => {
      call().conversation.note(text, picture, respond);
    },
    tune: (tuning): void => {
      call().conversation.tune(tuning);
    },
    record: (text): void => {
      recordTurn(call(), { who: 'tool', text, ok: true, detail: null });
    },
    delegate: (args) => options.tools.call(VOICE_TOOL_NAMES.see, args, toolCallerOf(call())),
    cameras: options.cameras,
    blocked: () => budget()?.reason() ?? null,
    now: options.now,
    time: (at) => clock.format(at),
    log: options.log,
  });
}
