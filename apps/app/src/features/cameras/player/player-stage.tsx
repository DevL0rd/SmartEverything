import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector, type ComposedGesture } from 'react-native-gesture-handler';
import { ThemeScope } from '../../../design/theme-scope';
import { cn } from '../../../design/cn';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { CameraSnapshot } from '../../device-visuals';
import type { CameraEntry } from '../logic/cameras';
import { PlayerStateView } from './player-state-view';
import { useStateActions } from './use-state-actions';
import type { LiveSession } from './use-live-session';
import type { Zoom } from './use-zoom';
import { VideoSurface } from './video-surface';

export interface PlayerStageProps {
  readonly entry: CameraEntry;
  readonly live: LiveSession;
  readonly compact: boolean;
  readonly cameraNameShown?: boolean;
  readonly snapshotFit?: 'contain' | 'cover';
  readonly videoFit?: 'contain' | 'cover';
  readonly zoom?: Zoom;
  readonly gesture?: ComposedGesture;
  readonly children?: ReactNode;
  readonly underBar?: boolean;
}

function Picture({
  live,
  zoom,
  fit,
}: Pick<PlayerStageProps, 'live' | 'zoom'> & { readonly fit: 'contain' | 'cover' }): ReactNode {
  const { session } = live;
  if (session.media === null) {
    return null;
  }
  return (
    <Animated.View style={zoom?.style} className="absolute inset-0">
      <VideoSurface
        media={session.media}
        muted={!session.audible || session.talking}
        onWheel={zoom?.wheel ?? null}
        onFrame={session.frameSeen}
        onSoundBlocked={session.soundBlocked}
        fit={fit}
      />
    </Animated.View>
  );
}

function Surface({
  live,
  zoom,
  gesture,
  fit,
}: Pick<PlayerStageProps, 'live' | 'zoom' | 'gesture'> & {
  readonly fit: 'contain' | 'cover';
}): ReactNode {
  const picture = (
    <View onLayout={zoom?.onLayout} className="absolute inset-0 overflow-hidden">
      <Picture live={live} fit={fit} {...(zoom === undefined ? {} : { zoom })} />
    </View>
  );
  return gesture === undefined ? (
    picture
  ) : (
    <GestureDetector gesture={gesture}>{picture}</GestureDetector>
  );
}

function isMuted(compact: boolean, kind: string): boolean {
  return compact && kind !== 'live' && kind !== 'connecting';
}

export function PlayerStage({
  entry,
  live,
  compact,
  cameraNameShown = false,
  snapshotFit = 'cover',
  videoFit = 'contain',
  zoom,
  gesture,
  children,
  underBar = false,
}: PlayerStageProps): ReactNode {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const actions = useStateActions(entry, live.session);
  const muted = isMuted(compact, live.state.kind);
  const stage = (
    <View className={cn('absolute inset-0 overflow-hidden', muted ? 'bg-surface-2' : 'bg-black')}>
      {live.state.kind === 'live' ? null : (
        <CameraSnapshot
          deviceId={entry.device.id}
          label={entry.name}
          placeholder={false}
          fit={snapshotFit}
        />
      )}
      <Surface
        live={live}
        fit={videoFit}
        {...(zoom === undefined ? {} : { zoom })}
        {...(gesture === undefined ? {} : { gesture })}
      />
      <PlayerStateView
        state={live.state}
        name={entry.name}
        timeZone={timeZone}
        now={now}
        actions={actions}
        compact={compact}
        cameraNameShown={cameraNameShown}
        underBar={underBar}
        muted={muted}
      />
      {children}
    </View>
  );
  return muted ? stage : <ThemeScope theme="dark">{stage}</ThemeScope>;
}
