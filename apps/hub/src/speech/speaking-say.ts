import { SpeakingScope, type SpeakingMedia } from '../reach/room-media';
import type { Saying, SpeechRequest } from './one-shot-speech';

export async function sayWhileSpeaking(
  media: SpeakingMedia | undefined,
  say: (request: SpeechRequest) => Promise<Saying>,
  request: SpeechRequest,
): Promise<Saying> {
  const scope = new SpeakingScope(media, {
    id: request.id,
    deviceId: null,
    clientId: null,
    ...request.at,
  });
  const { sink } = request;
  const saying = await say({
    ...request,
    sink: {
      ...sink,
      audio: (packet): void => {
        scope.start();
        sink.audio(packet);
      },
      ended: (reason, detail): void => {
        scope.close();
        sink.ended(reason, detail);
      },
    },
  });
  return {
    end: async (reason): Promise<void> => {
      try {
        await saying.end(reason);
      } finally {
        scope.close();
      }
    },
  };
}
