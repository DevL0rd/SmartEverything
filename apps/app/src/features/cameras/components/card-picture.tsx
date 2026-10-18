import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { IconButton } from '../../../components/icon-button';
import { useIdiom } from '../../../design/platform';
import { useScreenPaused } from '../../../design/screen-pause';
import type { CameraEntry } from '../logic/cameras';
import { PlayerStage } from '../player/player-stage';
import { useScreenSession, type LiveSession } from '../player/use-live-session';
import { useOnScreen } from '../player/use-on-screen';
import { CameraSnapshot } from '../../device-visuals';

function HoverControls({
  entry,
  live,
}: {
  readonly entry: CameraEntry;
  readonly live: LiveSession;
}): ReactNode {
  const { session } = live;
  return (
    <View className="absolute right-2 top-2 flex-row gap-1">
      <IconButton
        icon={session.listening ? 'volume' : 'muted'}
        label={session.listening ? 'Mute sound' : 'Listen'}
        variant="overlay"
        selected={session.listening}
        onPress={() => {
          session.setListening(!session.listening);
        }}
      />
      <IconButton
        icon="maximize"
        label="Full screen"
        variant="overlay"
        href={href.camera(entry.device.id, 'full')}
      />
    </View>
  );
}

function usePictureGesture(
  entry: CameraEntry,
  onMenu: (() => void) | undefined,
): ReturnType<typeof Gesture.Exclusive> {
  const router = useRouter();
  const open = (mode: 'full' | null): void => {
    router.navigate(href.camera(entry.device.id, mode));
  };
  return Gesture.Exclusive(
    Gesture.LongPress()
      .runOnJS(true)
      .onStart(() => {
        onMenu?.();
      }),
    Gesture.Tap()
      .numberOfTaps(2)
      .runOnJS(true)
      .onEnd(() => {
        open('full');
      }),
    Gesture.Tap()
      .runOnJS(true)
      .onEnd(() => {
        open(null);
      }),
  );
}

export interface CardPictureProps {
  readonly entry: CameraEntry;
  readonly live: boolean;
  readonly hovered: boolean;
  readonly onMenu: (() => void) | undefined;
}

function Surface({
  entry,
  onMenu,
  children,
}: Omit<CardPictureProps, 'live' | 'hovered'> & { readonly children: ReactNode }): ReactNode {
  return (
    <GestureDetector gesture={usePictureGesture(entry, onMenu)}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Open ${entry.name}`}
        accessibilityHint="Double-tap the picture for full screen"
        className="absolute inset-0"
      >
        {children}
      </View>
    </GestureDetector>
  );
}

function LiveCardPicture({ entry, hovered, onMenu }: Omit<CardPictureProps, 'live'>): ReactNode {
  const { attach, onLayout, visible } = useOnScreen();
  const paused = useScreenPaused();
  const live = useScreenSession(entry, {
    enabled: true,
    answering: false,
    visible: visible && !paused,
    quality: 'tile',
  });
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      ref={attach}
      onLayout={onLayout}
      className="aspect-video w-full overflow-hidden bg-surface-2"
    >
      <Surface entry={entry} onMenu={onMenu}>
        <PlayerStage entry={entry} live={live} compact />
      </Surface>
      {hovered && pointer ? <HoverControls entry={entry} live={live} /> : null}
    </View>
  );
}

export function CardPicture({ entry, live, hovered, onMenu }: CardPictureProps): ReactNode {
  if (live) {
    return <LiveCardPicture entry={entry} hovered={hovered} onMenu={onMenu} />;
  }
  return (
    <View className="aspect-video w-full overflow-hidden bg-surface-2">
      <Surface entry={entry} onMenu={onMenu}>
        <CameraSnapshot deviceId={entry.device.id} label={entry.name} />
      </Surface>
    </View>
  );
}
