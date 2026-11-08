import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import {
  API_ENDPOINTS as E,
  VACUUM_VIDEO_TOPIC,
  type VacuumVideoOpening,
  type WatchTopic,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../../../../api/transport';
import { useSettings } from '../../../../store/selectors';
import { liveWatch } from '../../../../store/live-watch';
import { useLiveDemand } from '../../../../store/use-live-demand';
import {
  createCameraPeer,
  type CameraPeer,
  type MediaHandle,
  type PeerState,
} from '../../../cameras';
import {
  IDLE,
  forgetPassword,
  keepsPassword,
  phaseOfLink,
  rememberPassword,
  rememberedPassword,
  runOpening,
  type PeerLinkState,
  type VideoPhase,
} from './vacuum-video';

const log = new Logger('app.devices');

export const VACUUM_VIDEO_TOPICS: readonly WatchTopic[] = [VACUUM_VIDEO_TOPIC];

export interface VacuumVideo {
  readonly phase: VideoPhase;
  readonly media: MediaHandle | null;
  readonly listening: boolean;
  readonly start: () => void;
  readonly submit: (password: string) => void;
  readonly cancel: () => void;
  readonly setListening: (on: boolean) => void;
  readonly close: () => void;
}

function linkOf(state: PeerState): PeerLinkState {
  return state === 'connected' ||
    state === 'disconnected' ||
    state === 'failed' ||
    state === 'closed'
    ? state
    : 'other';
}

interface Session {
  readonly peer: CameraPeer;
  readonly attempt: number;
}

interface Opening {
  readonly deviceId: string;
  readonly peer: CameraPeer;
  readonly password: string | null;
  readonly current: () => boolean;
  readonly settle: (phase: VideoPhase) => void;
}

function startOpening({ deviceId, peer, password, current, settle }: Opening): void {
  liveWatch.sendNow();
  const ports = {
    offer: (): Promise<string> => peer.offer(),
    post: (secret: string | null, sdp: string): Promise<VacuumVideoOpening> =>
      api().call(E.openVacuumVideo, {
        params: { deviceId },
        body: secret === null ? { sdp } : { password: secret, sdp },
      }),
    answer: (sdp: string): Promise<void> => peer.answer(sdp),
  };
  background(
    runOpening(ports, password).then((next) => {
      if (!current()) return;
      log.info('vacuum.video_opening', { deviceId, phase: next.kind });
      if (!keepsPassword(next)) forgetPassword(deviceId);
      settle(next);
    }),
    'vacuum.video_open_failed',
    { deviceId },
  );
}

interface PeerSession {
  readonly phase: VideoPhase;
  readonly media: MediaHandle | null;
  readonly setPhase: (phase: VideoPhase) => void;
  readonly open: (password: string | null) => void;
  readonly drop: () => void;
  readonly session: RefObject<Session | null>;
}

function usePeerSession(deviceId: string): PeerSession {
  const iceServers = useSettings().ice_servers;
  const [phase, setPhase] = useState<VideoPhase>(IDLE);
  const [media, setMedia] = useState<MediaHandle | null>(null);
  const session = useRef<Session | null>(null);
  const attempts = useRef(0);
  const drop = (): void => {
    session.current?.peer.close();
    session.current = null;
    setMedia(null);
  };
  const open = (password: string | null): void => {
    drop();
    attempts.current += 1;
    const attempt = attempts.current;
    const peer = createCameraPeer({ twoWayAudio: false, video: true, iceServers });
    session.current = { peer, attempt };
    const current = (): boolean => session.current?.attempt === attempt;
    peer.onMedia((next) => {
      if (current()) setMedia(next);
    });
    peer.onState((state) => {
      if (current()) setPhase((now) => phaseOfLink(linkOf(state), now));
    });
    setPhase({ kind: 'opening' });
    const settle = (next: VideoPhase): void => {
      if (next.kind !== 'connecting') drop();
      setPhase(next);
    };
    startOpening({ deviceId, peer, password, current, settle });
  };
  return { phase, media, setPhase, open, drop, session };
}

export function useVacuumVideo(deviceId: string, active: boolean): VacuumVideo {
  useLiveDemand(deviceId, VACUUM_VIDEO_TOPICS, undefined, active);
  const [listening, setListeningState] = useState(false);
  const { phase, media, setPhase, open, drop, session } = usePeerSession(deviceId);
  const start = (): void => {
    open(rememberedPassword(deviceId));
  };
  const begin = useEffectEvent(start);
  const end = useEffectEvent((): void => {
    drop();
    setPhase(IDLE);
  });
  useEffect(() => {
    if (!active) return undefined;
    begin();
    return end;
  }, [active, deviceId]);
  return {
    phase,
    media,
    listening,
    start,
    submit: (password): void => {
      rememberPassword(deviceId, password);
      open(password);
    },
    cancel: (): void => {
      setPhase(IDLE);
    },
    setListening: (on): void => {
      setListeningState(on);
      session.current?.peer.setListening(on);
    },
    close: (): void => {
      drop();
      setPhase(IDLE);
      background(
        api().call(E.closeVacuumVideo, { params: { deviceId } }),
        'vacuum.video_close_failed',
        { deviceId },
      );
    },
  };
}
