import { Logger } from '@smarteverything/logging';
import { createAudioPlayer } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

const log = new Logger('app.clock');

export interface RadioPreview {
  readonly playingId: string | null;
  readonly failedId: string | null;
  readonly toggle: (stationId: string, url: string) => void;
}

interface Playing {
  readonly release: () => void;
}

function started(url: string, onFailed: () => void): Playing {
  const player = createAudioPlayer({ uri: url });
  const listener = player.addListener('playbackStatusUpdate', (status) => {
    if (status.error !== null) {
      log.warn('alarm.radio_preview_failed', { error: status.error });
      onFailed();
    }
  });
  const release = (): void => {
    listener.remove();
    try {
      player.pause();
    } finally {
      player.remove();
    }
  };
  player.play();
  return { release };
}

export function useRadioPreview(): RadioPreview {
  const current = useRef<Playing | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  useEffect(
    () => (): void => {
      current.current?.release();
      current.current = null;
    },
    [],
  );
  const stop = (): void => {
    current.current?.release();
    current.current = null;
    setPlayingId(null);
  };
  return {
    playingId,
    failedId,
    toggle: (stationId, url): void => {
      const same = playingId === stationId;
      stop();
      if (same) return;
      setFailedId(null);
      try {
        current.current = started(url, () => {
          stop();
          setFailedId(stationId);
        });
        setPlayingId(stationId);
        log.info('alarm.radio_preview_started', { stationId });
      } catch (error) {
        log.error('alarm.radio_preview_failed', error);
        setFailedId(stationId);
      }
    },
  };
}
