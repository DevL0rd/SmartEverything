import { useEffect, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { Logger } from '@smarteverything/logging';
import { useScreenPaused } from '../../../design/screen-pause';
import {
  cycleClipSpeed,
  markClipPlayed,
  useClipPlayed,
  useClipSpeed,
  type ClipSpeed,
} from './played-clips';

const log = new Logger('app.voice-message');
const STATUS_INTERVAL_MS = 150;

let active: AudioPlayer | null = null;

interface ClipSession {
  readonly player: AudioPlayer;
  readonly release: () => void;
}

interface ClipPlayback {
  readonly status: AudioStatus | null;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly playhead: SharedValue<number>;
  readonly played: boolean;
  readonly speed: ClipSpeed;
  readonly cycleSpeed: () => void;
  readonly toggle: () => void;
  readonly seek: (seconds: number) => void;
  readonly reset: () => void;
}

function pause(player: AudioPlayer): void {
  if (active === player) active = null;
  player.pause();
}

function play(player: AudioPlayer): void {
  if (active !== null && active !== player) pause(active);
  active = player;
  player.play();
}

function sessionOf(
  url: string,
  speed: ClipSpeed,
  onStatus: (status: AudioStatus) => void,
): ClipSession {
  const player = createAudioPlayer({ uri: url }, { updateInterval: STATUS_INTERVAL_MS });
  player.shouldCorrectPitch = true;
  player.playbackRate = speed;
  const listener = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish && active === player) active = null;
    onStatus(status);
  });
  return {
    player,
    release: (): void => {
      listener.remove();
      if (active === player) active = null;
      player.remove();
    },
  };
}

interface ClipSessions {
  readonly player: () => AudioPlayer | undefined;
  readonly open: (url: string, onStatus: (status: AudioStatus) => void) => AudioPlayer;
  readonly release: () => void;
}

function seeker(
  sessions: ClipSessions,
  playhead: SharedValue<number>,
  fail: (cause: unknown) => void,
): (seconds: number) => void {
  return (seconds) => {
    const player = sessions.player();
    playhead.set(seconds);
    player?.seekTo(seconds).catch((cause: unknown) => {
      if (sessions.player() === player) fail(cause);
    });
  };
}

function useClipSessions(speed: ClipSpeed): ClipSessions {
  const session = useRef<ClipSession | null>(null);
  const paused = useScreenPaused();
  const release = (): void => {
    session.current?.release();
    session.current = null;
  };
  useEffect(() => release, []);
  useEffect(() => {
    if (paused && active !== null && active === session.current?.player) pause(active);
  }, [paused]);
  useEffect(() => {
    if (session.current !== null) session.current.player.playbackRate = speed;
  }, [speed]);
  return {
    player: () => session.current?.player,
    open: (url: string, onStatus: (status: AudioStatus) => void): AudioPlayer => {
      session.current ??= sessionOf(url, speed, onStatus);
      return session.current.player;
    },
    release,
  };
}

function togglePlayer(player: AudioPlayer, onStart: () => void): void {
  if (active === player) {
    pause(player);
    return;
  }
  onStart();
  play(player);
}

type ClipId = string | null;

function useClipPrefs(attachmentId: ClipId): {
  readonly speed: ClipSpeed;
  readonly played: boolean;
  readonly playhead: SharedValue<number>;
} {
  return {
    speed: useClipSpeed(),
    played: useClipPlayed(attachmentId),
    playhead: useSharedValue(0),
  };
}

function isLoading(started: boolean, failed: boolean, status: AudioStatus | null): boolean {
  return started && !failed && (status?.isLoaded !== true || status.isBuffering);
}

export function useClipPlayback(url: string | undefined, attachmentId: ClipId): ClipPlayback {
  const { speed, played, playhead } = useClipPrefs(attachmentId);
  const sessions = useClipSessions(speed);
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const fail = (cause: unknown): void => {
    log.warn('voice_message.playback_failed', { errorType: typeof cause });
    setFailed(true);
    if (active !== null && active === sessions.player()) pause(active);
  };
  const track = (next: AudioStatus): void => {
    playhead.set(next.currentTime);
    setStatus(next);
    if (next.error !== null) fail(next.error);
  };
  const seek = seeker(sessions, playhead, fail);
  const reset = (): void => {
    sessions.release();
    setStarted(false);
    setStatus(null);
    playhead.set(0);
    setFailed(false);
  };
  const toggle = (): void => {
    if (url === undefined || failed) return;
    try {
      togglePlayer(sessions.open(url, track), () => {
        setStarted(true);
        if (attachmentId !== null) markClipPlayed(attachmentId);
        if (status?.didJustFinish === true) seek(0);
      });
    } catch (cause) {
      fail(cause);
    }
  };
  return {
    status,
    loading: isLoading(started, failed, status),
    failed,
    playhead,
    played,
    speed,
    cycleSpeed: cycleClipSpeed,
    reset,
    toggle,
    seek,
  };
}
