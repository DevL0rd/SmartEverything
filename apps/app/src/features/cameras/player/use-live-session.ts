import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import type { CameraQuality } from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import { useSettings } from '../../../store/selectors';
import { useCameraCondition, useCameraPrefs } from '../data/use-camera-condition';
import type { CameraEntry } from '../logic/cameras';
import { blockingStateOf, playerStateOf, type PlayerState } from './player-state';
import { mutedByDefault } from './sound-wish';
import { useCameraSession, type CameraSession } from './use-camera-session';

const log = new Logger('app.camera-session');

export interface LiveSession {
  readonly session: CameraSession;
  readonly state: PlayerState;
  readonly relay: boolean;
}

export interface LiveOptions {
  readonly enabled: boolean;
  readonly answering: boolean;
  readonly visible?: boolean;
  readonly quality?: CameraQuality;
  readonly viewer?: boolean;
  readonly waitForFocus?: boolean;
}

function useFocusLifecycle(session: CameraSession, deviceId: string): void {
  const { suspend, resume } = session;
  useFocusEffect(
    useCallback(() => {
      log.debug('camera.screen_focused', { deviceId });
      resume('focus');
      return (): void => {
        log.debug('camera.screen_blurred', { deviceId });
        suspend('focus');
      };
    }, [resume, suspend, deviceId]),
  );
}

function useAppLifecycle(session: CameraSession, deviceId: string): void {
  const { suspend, resume } = session;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      log.debug('camera.app_state_changed', { deviceId, next });
      if (next === 'active') {
        resume('app');
      } else if (next === 'background') {
        suspend('app');
      }
    });
    return (): void => {
      subscription.remove();
    };
  }, [resume, suspend, deviceId]);
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
    quality: options.quality ?? 'full',
    answering: options.answering,
    muted: mutedByDefault({
      viewer: options.viewer === true,
      mutedPreference: prefs.value.muted,
    }),
    waitForFocus: options.waitForFocus === true,
  });
  useAppLifecycle(session, entry.device.id);
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
  useFocusLifecycle(live.session, entry.device.id);
  return live;
}
