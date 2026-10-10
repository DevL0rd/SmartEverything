import { useCallback, useEffect, useRef, useState } from 'react';
import type { IceServer } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { answerTalkOffer } from '../../../api/media';
import { notify } from '../../../components/toast-store';
import { createCameraPeer } from './rtc';
import { rawErrorText } from '../../../format/errors';

const log = new Logger('app.camera-talk');

function talkFailed(error: unknown): void {
  log.warn('camera.talk_failed', {
    reason: rawErrorText(error),
  });
  notify({ message: 'Talk didn’t start', error, tone: 'critical' });
}

export interface Talk {
  readonly talking: boolean;
  readonly talkPending: boolean;
  readonly setTalking: (talking: boolean) => void;
}

export interface TalkTarget {
  readonly deviceId: string;
  readonly iceServers: readonly IceServer[];
  readonly active: boolean;
}

function openTalk(target: TalkTarget, onLive: () => void): () => void {
  let stopped = false;
  const peer = createCameraPeer({ twoWayAudio: true, video: false, iceServers: target.iceServers });
  peer.setListening(false);
  peer.onState((state) => {
    if (state === 'connected' && !stopped) {
      peer.setTalking(true).then(onLive, talkFailed);
    }
  });
  peer
    .offer()
    .then((offer) => answerTalkOffer(target.deviceId, offer))
    .then((answer) => (stopped ? undefined : peer.answer(answer)))
    .catch((error: unknown) => {
      if (!stopped) {
        talkFailed(error);
      }
    });
  return (): void => {
    stopped = true;
    peer.close();
  };
}

export const TALK_LIMIT_MS = 2 * 60_000;

export interface TalkSession {
  readonly live: boolean;
  readonly stop: () => void;
}

export function useTalkSession(target: TalkTarget, onLimit: () => void): TalkSession {
  const [live, setLive] = useState(false);
  const close = useRef<(() => void) | null>(null);
  const { deviceId, iceServers, active } = target;
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    close.current = openTalk({ deviceId, iceServers, active }, () => {
      setLive(true);
    });
    const limit = setTimeout(onLimit, TALK_LIMIT_MS);
    return (): void => {
      clearTimeout(limit);
      close.current?.();
      close.current = null;
      setLive(false);
    };
  }, [deviceId, iceServers, active, onLimit]);
  const stop = useCallback((): void => {
    close.current?.();
    close.current = null;
  }, []);
  return { live: active && live, stop };
}

export interface Listening {
  readonly listening: boolean;
  readonly setListening: (listening: boolean) => void;
}

interface Choice {
  readonly listening: boolean;
  readonly basis: string;
}

export function useListening(
  apply: (listening: boolean | null) => void,
  muted: boolean,
  answering: boolean,
): Listening {
  const basis = `${String(muted)}/${String(answering)}`;
  const [choice, setChoice] = useState<Choice | null>(null);
  const listening = choice?.basis === basis ? choice.listening : answering || !muted;
  useEffect(() => {
    apply(listening);
    return (): void => {
      apply(null);
    };
  }, [apply, listening]);
  const setListening = useCallback(
    (next: boolean): void => {
      setChoice({ listening: next, basis });
    },
    [basis],
  );
  return { listening, setListening };
}
