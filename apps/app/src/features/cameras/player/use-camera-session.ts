import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { ApiClient } from '../../../api/connection/client';
import type { CameraQuality, IceServer } from '@smarteverything/domain';
import { preloader } from '../../../app-shell/preloader';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';
import type { MediaHandle, Transport } from './peer-types';
import type { SessionPhase, VideoFlow } from './player-state';
import { restartSession, type SharedState } from './session-registry';
import { SessionLease, startPausesOf, type PauseReason } from './session-lease';
import { talkIntentOf } from './talk-wish';
import { useListening, useTalkSession, type Talk } from './use-talk';

export interface SessionOptions {
  readonly deviceId: string;
  readonly twoWayAudio: boolean;
  readonly iceServers: readonly IceServer[];
  readonly client: ApiClient | null;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly quality: CameraQuality;
  readonly answering: boolean;
  readonly muted: boolean;
  readonly waitForFocus: boolean;
}

export interface CameraSession {
  readonly phase: SessionPhase;
  readonly video: VideoFlow;
  readonly media: MediaHandle | null;
  readonly transport: Transport;
  readonly retry: () => void;
  readonly suspend: (reason: PauseReason) => void;
  readonly resume: (reason: PauseReason) => void;
  readonly frameSeen: () => void;
  readonly soundBlocked: () => void;
  readonly stats: () => Promise<unknown>;
  readonly listening: boolean;
  readonly audible: boolean;
  readonly setListening: (listening: boolean) => void;
  readonly talking: boolean;
  readonly talkPending: boolean;
  readonly setTalking: (talking: boolean) => void;
}

const NOBODY = new ValueStore<SharedState>({
  phase: { kind: 'idle' },
  video: 'waiting',
  media: null,
  transport: 'webrtc',
});

function useLease(options: SessionOptions): SessionLease {
  const [lease] = useState(
    () =>
      new SessionLease(
        startPausesOf({
          waitForFocus: options.waitForFocus,
          backgrounded: AppState.currentState === 'background',
        }),
      ),
  );
  const { deviceId, client, iceServers, quality, enabled, visible } = options;
  useEffect(() => {
    if (client === null) {
      lease.letGo();
      return;
    }
    lease.want({ deviceId, client, iceServers, quality }, enabled && visible);
  }, [lease, deviceId, client, iceServers, quality, enabled, visible]);
  useEffect(
    () => (): void => {
      lease.letGo();
    },
    [lease],
  );
  return lease;
}

function usePreloaderPause(live: boolean): void {
  useEffect(() => (live ? preloader.pause() : undefined), [live]);
}

function useTalkState(options: SessionOptions, lease: SessionLease, state: SharedState): Talk {
  const [wantedFor, setWantedFor] = useState<string | null>(null);
  const { deviceId } = options;
  const { talk, active, over } = talkIntentOf({
    wantedFor,
    deviceId,
    twoWayAudio: options.twoWayAudio,
    transport: state.transport,
    phase: state.phase,
  });
  if (over && wantedFor !== null) {
    setWantedFor(null);
  }
  const setWanted = useCallback(
    (wanted: boolean): void => {
      setWantedFor(wanted ? deviceId : null);
    },
    [deviceId],
  );
  const stopAtLimit = useCallback((): void => {
    setWantedFor(null);
    notify({ message: 'Talk stopped after 2 minutes' });
  }, []);
  const session = useTalkSession(
    { deviceId, client: options.client, iceServers: options.iceServers, active },
    stopAtLimit,
  );
  const { stop } = session;
  useEffect(
    () =>
      lease.onSuspend(() => {
        stop();
        setWantedFor(null);
      }),
    [lease, stop],
  );
  return { talking: session.live, talkPending: talk && !session.live, setTalking: setWanted };
}

export function useCameraSession(options: SessionOptions): CameraSession {
  const lease = useLease(options);
  const { session: shared, suspended } = useValue(lease.current);
  const state = useValue(shared?.state ?? NOBODY);
  const connected = state.phase.kind === 'connected';
  usePreloaderPause(connected);
  const { visible } = options;
  const applyListening = useCallback(
    (listening: boolean | null): void => {
      lease.listen(listening === null ? null : listening && visible);
    },
    [lease, visible],
  );
  const audio = useListening(applyListening, options.muted, options.answering);
  const talk = useTalkState(options, lease, state);
  return {
    ...state,
    retry: (): void => {
      lease.resume('focus');
      if (shared !== null) {
        restartSession(shared);
      }
    },
    suspend: lease.suspend,
    resume: lease.resume,
    frameSeen: (): void => {
      shared?.frameSeen();
    },
    soundBlocked: (): void => {
      audio.setListening(false);
    },
    stats: (): Promise<unknown> => shared?.stats() ?? Promise.resolve(null),
    ...audio,
    audible: audio.listening && visible && !suspended,
    ...talk,
  };
}
