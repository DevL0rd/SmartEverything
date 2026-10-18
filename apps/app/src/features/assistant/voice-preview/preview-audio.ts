import { Logger } from '@smarteverything/logging';
import { createAudioPlayer } from 'expo-audio';
import { API_ENDPOINTS as E, type VoiceSample } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { PreviewPlaybackEvents, PreviewPorts } from './preview-controller';

const log = new Logger('app.voice-preview');
function play(sample: VoiceSample, events: PreviewPlaybackEvents): () => void {
  const player = createAudioPlayer({ uri: `data:audio/wav;base64,${sample.audio}` });
  const listener = player.addListener('playbackStatusUpdate', (status) => {
    if (status.error !== null) {
      log.warn('voice_preview.playback_error', { errorType: typeof status.error });
      events.failed(status.error);
    } else if (status.didJustFinish) events.finished();
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
    log.debug('voice_preview.play_started', { audioLength: sample.audio.length });
  } catch (error) {
    log.error('voice_preview.play_failed', error);
    release();
    throw error;
  }
  return release;
}
export function voicePreviewPorts(): PreviewPorts {
  const client = api();
  return {
    load: (voice, signal) =>
      client.call(E.readAssistantVoiceSample, { params: { voice } }, { signal }),
    play,
  };
}
