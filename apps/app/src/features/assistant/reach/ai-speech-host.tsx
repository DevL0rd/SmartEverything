import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createAudioPlayer } from 'expo-audio';
import type { AiSpeechNotice } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { onAiSpeech } from '../../../store/ai-speech-requests';

const log = new Logger('app.ai-speech');

function play(notice: AiSpeechNotice): void {
  const player = createAudioPlayer({ uri: `data:audio/ogg;base64,${notice.audio}` });
  const listener = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) {
      listener.remove();
      player.remove();
    }
  });
  player.play();
  notify({ message: `${notice.from} said: ${notice.text}` });
  log.info('ai_speech.played', { id: notice.id });
}

export function AiSpeechHost(): ReactNode {
  useEffect(
    () =>
      onAiSpeech((notice) => {
        try {
          play(notice);
        } catch (error) {
          log.warn('ai_speech.unplayable', { id: notice.id, reason: String(error) });
          notify({ message: `${notice.from} said: ${notice.text}`, error, tone: 'critical' });
        }
      }),
    [],
  );
  return null;
}
