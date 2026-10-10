import { useEffect } from 'react';
import { createAudioPlayer } from 'expo-audio';
import { Logger } from '@smarteverything/logging';
import RING_TONE from '../../../../assets/sounds/ring.wav';

const log = new Logger('app.calls');

export function useRingTone(ringing: boolean): void {
  useEffect(() => {
    if (!ringing) {
      return undefined;
    }
    const player = createAudioPlayer(RING_TONE);
    player.loop = true;
    player.play();
    log.info('ring_tone.started');
    return (): void => {
      player.pause();
      player.remove();
      log.info('ring_tone.stopped');
    };
  }, [ringing]);
}
