import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { DURATION, useMotion } from '../../../design/motion';
import { recordClip } from '../../../api/media';
import type { CameraEntry } from '../logic/cameras';
import { canSharePictures, enterPictureInPicture, pictureInPictureSupported } from './rtc';
import { takeSnapshot } from './snapshot';
import { TalkButton } from './talk-button';
import type { LiveSession } from './use-live-session';
import type { PadSize } from './ptz-pad';
import { SideControls } from './side-controls';
import { useSizeClass } from '../../../design/size-class';
import type { Ptz, PtzDirection } from './use-ptz';
import type { CameraZoom } from './use-camera-zoom';
import type { Zoom } from './use-zoom';

const CLIP_SECONDS = 30;

export interface PlayerControlsProps {
  readonly entry: CameraEntry;
  readonly live: LiveSession;
  readonly zoom: Zoom;
  readonly camera: CameraZoom;
  readonly ptz: Ptz;
  readonly visible: boolean;
  readonly fullScreen: boolean;
  readonly onFullScreen: () => void;
  readonly infoInMenu: boolean;
  readonly onInfo: () => void;
  readonly onQuick: (() => void) | null;
}

function padSizeOf(fullScreen: boolean, compact: boolean): PadSize {
  if (fullScreen) {
    return 'large';
  }
  return compact ? 'small' : 'medium';
}

function useFade(visible: boolean): ReturnType<typeof useAnimatedStyle<ViewStyle>> {
  const { reduced } = useMotion();
  return useAnimatedStyle((): ViewStyle => ({
    opacity: reduced ? Number(visible) : withTiming(Number(visible), { duration: DURATION.short }),
  }));
}

function record(entry: CameraEntry): void {
  recordClip(entry.device.id, CLIP_SECONDS).then(
    () => {
      notify({
        message: `Recording ${String(CLIP_SECONDS)} s from ${entry.name}`,
        tone: 'positive',
      });
    },
    (error: unknown) => {
      notify({
        message: 'The clip didn’t start',
        error,
        tone: 'critical',
      });
    },
  );
}

function SoundControls({ entry, live }: Pick<PlayerControlsProps, 'entry' | 'live'>): ReactNode {
  const { session } = live;
  return (
    <View className="flex-row items-center gap-2">
      {entry.camera?.two_way_audio === true &&
      !live.relay &&
      (live.state.kind === 'live' || session.talking || session.talkPending) ? (
        <TalkButton
          talking={session.talking}
          pending={session.talkPending}
          setTalking={session.setTalking}
        />
      ) : null}
      <IconButton
        icon={session.listening ? 'volume' : 'muted'}
        label={session.listening ? 'Mute sound' : 'Listen'}
        variant="overlay"
        selected={session.listening}
        shortcut="M"
        onPress={() => {
          session.setListening(!session.listening);
        }}
      />
    </View>
  );
}

function ExtraControls({ live, onQuick }: PlayerControlsProps): ReactNode {
  const { media } = live.session;
  return (
    <>
      {onQuick === null ? null : (
        <IconButton icon="customize" label="Quick settings" variant="overlay" onPress={onQuick} />
      )}
      {media !== null && pictureInPictureSupported() ? (
        <IconButton
          icon="layers"
          label="Picture in picture"
          variant="overlay"
          onPress={() => {
            enterPictureInPicture(media);
          }}
        />
      ) : null}
    </>
  );
}

function ActionControls(props: PlayerControlsProps): ReactNode {
  const { entry, live } = props;
  const source = {
    media: live.session.media,
    transport: live.session.transport,
    deviceId: entry.device.id,
    name: entry.name,
  };
  return (
    <View className="flex-row items-center gap-1">
      <IconButton
        icon="camera"
        label="Save snapshot"
        variant="overlay"
        onPress={() => {
          takeSnapshot(source, canSharePictures() ? 'share' : 'download');
        }}
      />
      {entry.camera === null ? null : (
        <IconButton
          icon="film"
          label={`Record ${String(CLIP_SECONDS)} s clip`}
          variant="overlay"
          onPress={() => {
            record(entry);
          }}
        />
      )}
      <ExtraControls {...props} />
      {props.infoInMenu ? null : (
        <IconButton icon="info" label="Stream info" variant="overlay" onPress={props.onInfo} />
      )}
      {props.fullScreen ? null : (
        <IconButton
          icon="maximize"
          label="Full screen"
          variant="overlay"
          shortcut="F"
          onPress={props.onFullScreen}
        />
      )}
    </View>
  );
}

const TURNING: Readonly<Record<PtzDirection, string>> = {
  left: 'Turning left',
  right: 'Turning right',
  up: 'Tilting up',
  down: 'Tilting down',
};

function Indicators({ live, ptz }: Pick<PlayerControlsProps, 'live' | 'ptz'>): ReactNode {
  const chips = [
    ptz.moving === null ? null : TURNING[ptz.moving],
    live.relay ? 'Through your server' : null,
  ].filter((chip): chip is string => chip !== null);
  if (chips.length === 0) {
    return null;
  }
  return (
    <View pointerEvents="none" className="absolute right-3 top-3 flex-row gap-2">
      {chips.map((chip) => (
        <View key={chip} className="rounded-full bg-black/60 px-3 py-1">
          <Text variant="caption">{chip}</Text>
        </View>
      ))}
    </View>
  );
}

export function PlayerControls(props: PlayerControlsProps): ReactNode {
  const fade = useFade(props.visible);
  const compact = useSizeClass().width === 'compact';
  return (
    <>
      <Indicators live={props.live} ptz={props.ptz} />
      <Animated.View
        style={fade}
        pointerEvents={props.visible ? 'box-none' : 'none'}
        className="absolute inset-0"
      >
        <SideControls
          ptz={props.ptz}
          zoom={props.zoom}
          camera={props.camera}
          size={padSizeOf(props.fullScreen, compact)}
          live={props.live.state.kind === 'live'}
        />
        {props.live.state.kind === 'live' ||
        props.live.session.talking ||
        props.live.session.talkPending ? (
          <View
            className={cn(
              'absolute inset-x-0 bottom-0 flex-row items-center justify-between gap-2 bg-black/40 px-3 pt-2',
              props.fullScreen ? 'pb-safe-offset-2' : 'pb-2',
            )}
          >
            <SoundControls entry={props.entry} live={props.live} />
            <ActionControls {...props} />
          </View>
        ) : null}
      </Animated.View>
    </>
  );
}
