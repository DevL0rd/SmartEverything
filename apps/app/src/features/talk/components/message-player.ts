import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Logger } from '@smarteverything/logging';
import { talkMessageUrl } from '../../../api/talk';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';
import { rawErrorText } from '../../../format/errors';

const log = new Logger('app.talk-replay');

const playing = new ValueStore<string | null>(null);

let player: AudioPlayer | null = null;

function stopNow(): void {
  player?.pause();
  player?.remove();
  player = null;
  playing.set(null);
}

export function usePlayingMessage(): string | null {
  return useValue(playing);
}

export function toggleMessage(messageId: string): void {
  if (playing.get() === messageId) {
    stopNow();
    return;
  }
  stopNow();
  playing.set(messageId);
  talkMessageUrl(messageId).then(
    (url) => {
      if (playing.get() !== messageId) {
        return;
      }
      const next = createAudioPlayer({ uri: url });
      next.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish && playing.get() === messageId) {
          stopNow();
        }
      });
      player = next;
      next.play();
    },
    (error: unknown) => {
      log.warn('talk.replay_failed', { messageId, reason: rawErrorText(error) });
      notify({ message: 'That message can’t be played', error, tone: 'critical' });
      stopNow();
    },
  );
}
