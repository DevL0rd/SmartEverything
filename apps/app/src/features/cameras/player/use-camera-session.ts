import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '../../../api/connection/client';
import type { IceServer } from '@smarteverything/domain';
import { preloader } from '../../../app-shell/preloader';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';
import type { MediaHandle, Transport } from './peer-types';
import type { SessionPhase, VideoFlow } from './player-state';
import { restartSession, type SharedState } from './session-registry';
import { SessionLease } from './session-lease';
import { useListening, useTalkSession, type Talk } from './use-talk';

export interface SessionOptions {
  readonly deviceId: string;
  readonly twoWayAudio: boolean;
  readonly iceServers: readonly IceServer[];
  readonly client: ApiClient | null;
  readonly enabled: boolean;
  readonly visible: boolean;
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
  readonly suspend: () => void;
  readonly resume: () => void;
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
  const [lease] = useState(() => new SessionLease(options.waitForFocus));
  const { deviceId, client, iceServers, enabled, visible } = options;
  useEffect(() => {
    if (client === null) {
      lease.letGo();
      return;
    }
    lease.want({ deviceId, client, iceServers }, enabled && visible);
  }, [lease, deviceId, client, iceServers, enabled, visible]);
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
  const [wantedFor, setWantedFor] = useState<{
    readonly deviceId: string;
    readonly phase: SessionPhase;
  } | null>(null);
  const { deviceId } = options;
  const talk =
    options.twoWayAudio &&
    wantedFor?.deviceId === deviceId &&
    wantedFor.phase === state.phase &&
    state.transport === 'webrtc';
  const setWanted = useCallback(
    (wanted: boolean): void => {
      setWantedFor(wanted ? { deviceId, phase: state.phase } : null);
    },
    [deviceId, state.phase],
  );
  const stopAtLimit = useCallback((): void => {
    setWantedFor(null);
    notify({ message: 'Talk stopped after 2 minutes' });
  }, []);
  const session = useTalkSession(
    {
      deviceId,
      client: options.client,
      iceServers: options.iceServers,
      active: talk && state.phase.kind === 'connected',
    },
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
      lease.resume();
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
