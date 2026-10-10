import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector, type ComposedGesture } from 'react-native-gesture-handler';
import { ScopedTheme } from 'uniwind';
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
  readonly zoom?: Zoom;
  readonly gesture?: ComposedGesture;
  readonly children?: ReactNode;
  readonly underBar?: boolean;
}

function Picture({ live, zoom }: Pick<PlayerStageProps, 'live' | 'zoom'>): ReactNode {
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
      />
    </Animated.View>
  );
}

function Surface({
  live,
  zoom,
  gesture,
}: Pick<PlayerStageProps, 'live' | 'zoom' | 'gesture'>): ReactNode {
  const picture = (
    <View onLayout={zoom?.onLayout} className="absolute inset-0 overflow-hidden">
      <Picture live={live} {...(zoom === undefined ? {} : { zoom })} />
    </View>
  );
  return gesture === undefined ? (
    picture
  ) : (
    <GestureDetector gesture={gesture}>{picture}</GestureDetector>
  );
}

export function PlayerStage({
  entry,
  live,
  compact,
  zoom,
  gesture,
  children,
  underBar = false,
}: PlayerStageProps): ReactNode {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const actions = useStateActions(entry, live.session);
  const muted = compact && live.state.kind !== 'live' && live.state.kind !== 'connecting';
  const stage = (
    <View className={cn('absolute inset-0 overflow-hidden', muted ? 'bg-surface-2' : 'bg-black')}>
      {live.state.kind === 'live' ? null : (
        <CameraSnapshot deviceId={entry.device.id} label={entry.name} placeholder={false} />
      )}
      <Surface
        live={live}
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
        underBar={underBar}
        muted={muted}
      />
      {children}
    </View>
  );
  return muted ? stage : <ScopedTheme theme="dark">{stage}</ScopedTheme>;
}
