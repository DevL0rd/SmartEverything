import type { CallLink } from './call-link';
import type { TurnTrace } from './turn-trace';

export function tracedLink(link: CallLink, trace: TurnTrace): CallLink {
  return {
    ...link,
    audio: (frames): void => {
      link.audio(frames);
      if (frames.length > 0) {
        trace.audioSent(frames.length);
      }
    },
  };
}
