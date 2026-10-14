import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, useConnection } from '../../../api/transport';
import { useSettings } from '../../../store/selectors';
import { useCameraCondition, useCameraPrefs } from '../data/use-camera-condition';
import type { CameraEntry } from '../logic/cameras';
import { blockingStateOf, playerStateOf, type PlayerState } from './player-state';
import { useCameraSession, type CameraSession } from './use-camera-session';

export interface LiveSession {
  readonly session: CameraSession;
  readonly state: PlayerState;
  readonly relay: boolean;
}

export interface LiveOptions {
  readonly enabled: boolean;
  readonly answering: boolean;
  readonly visible?: boolean;
  readonly waitForFocus?: boolean;
}

function useFocusLifecycle(session: CameraSession): void {
  const { suspend, resume } = session;
  useFocusEffect(
    useCallback(() => {
      resume();
      return suspend;
    }, [resume, suspend]),
  );
}

function useAppLifecycle(session: CameraSession): void {
  const { suspend, resume } = session;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        resume();
      } else if (next === 'background') {
        suspend();
      }
    });
    return (): void => {
      subscription.remove();
    };
  }, [resume, suspend]);
}

export function useLiveSession(entry: CameraEntry, options: LiveOptions): LiveSession {
  const condition = useCameraCondition(entry);
  const prefs = useCameraPrefs();
  const connection = useConnection();
  const settings = useSettings();
  const client = connection.status === 'paired' ? api() : null;
  const streamable = entry.camera !== null;
  const session = useCameraSession({
    deviceId: entry.device.id,
    twoWayAudio: entry.camera?.two_way_audio ?? false,
    iceServers: settings.ice_servers,
    client,
    enabled: options.enabled && streamable && blockingStateOf(condition) === null,
    visible: options.visible !== false,
    answering: options.answering,
    muted: prefs.value.muted,
    waitForFocus: options.waitForFocus === true,
  });
  useAppLifecycle(session);
  const state = playerStateOf({
    ...condition,
    streamable,
    phase: session.phase,
    video: session.video,
  });
  return { session, state, relay: session.transport === 'mse' };
}

export function useScreenSession(entry: CameraEntry, options: LiveOptions): LiveSession {
  const live = useLiveSession(entry, { ...options, waitForFocus: true });
  useFocusLifecycle(live.session);
  return live;
}
