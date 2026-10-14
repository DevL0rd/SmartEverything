import { createAudioPlayer } from 'expo-audio';
import { API_ENDPOINTS as E, type VoicePreview } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import type { PreviewPlaybackEvents, PreviewPorts } from './preview-controller';

const log = new Logger('app.voice-preview');
function play(sample: VoicePreview, events: PreviewPlaybackEvents): () => void {
  const player = createAudioPlayer({ uri: `data:${sample.mime};base64,${sample.audio}` });
  const listener = player.addListener('playbackStatusUpdate', (status) => {
    if (status.error !== null) events.failed(status.error);
    else if (status.didJustFinish) events.finished();
    else if (status.playing) events.playing();
  });
  const release = (): void => {
    listener.remove();
    try {
      player.pause();
    } finally {
      player.remove();
    }
  };
  try {
    player.play();
  } catch (error) {
    release();
    throw error;
  }
  return release;
}
export function voicePreviewPorts(): PreviewPorts {
  const client = api();
  return {
    load: (request) => client.call(E.previewAssistantVoice, { body: request }),
    cancel: (request): void => {
      void client
        .call(E.cancelAssistantVoicePreview, {
          body: { requestId: request.requestId, generation: request.generation },
        })
        .catch((error: unknown) => {
          log.warn('voice_preview.cancel_failed', {
            reason: error instanceof Error ? error.message : String(error),
          });
        });
    },
    play,
  };
}
