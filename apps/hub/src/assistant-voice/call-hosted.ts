import type { Call } from './call-parts';
import type { HostedCall } from './outreach';

export function hostedCallOf(call: Call): HostedCall {
  const { conversation } = call;
  return {
    hear: (pcm16k): void => {
      conversation.hear(pcm16k);
    },
    see: (frame): void => {
      conversation.video(frame);
    },
    note: (text): void => {
      conversation.note(text);
    },
    say: (text): void => {
      conversation.say(text);
    },
    mute: (muted): void => {
      conversation.mute(muted);
    },
    end: (reason) => conversation.end(reason),
  };
}
