import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { IconButton } from '../../../components/icon-button';
import { isNative, useIdiom } from '../../../design/platform';
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
    <View className="absolute bottom-0 right-0 flex-row gap-2 p-card-pad">
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

type OpenPicture = (mode: 'full' | null) => void;

function pictureGesture(
  open: OpenPicture,
  onMenu: (() => void) | undefined,
): ReturnType<typeof Gesture.Exclusive> {
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

function pictureShortcut(
  { key, shiftKey }: KeyboardEvent,
  open: OpenPicture,
  onMenu: (() => void) | undefined,
): (() => void) | undefined {
  if (key === 'Enter' && shiftKey) {
    return (): void => {
      open('full');
    };
  }
  return key === 'ContextMenu' || (key === 'F10' && shiftKey) ? onMenu : undefined;
}

function pictureKeys(
  open: OpenPicture,
  onMenu: (() => void) | undefined,
): {
  readonly 'aria-keyshortcuts'?: string;
  readonly onClick?: (event: MouseEvent) => void;
  readonly onKeyDownCapture?: (event: KeyboardEvent) => void;
} {
  if (isNative()) return {};
  return {
    'aria-keyshortcuts': onMenu === undefined ? 'Shift+Enter' : 'Shift+Enter Shift+F10 ContextMenu',
    onClick: (event): void => {
      if (event.detail !== 0) return;
      event.stopPropagation();
      open(null);
    },
    onKeyDownCapture: (event): void => {
      if (event.target !== event.currentTarget) return;
      const shortcut = pictureShortcut(event, open, onMenu);
      if (event.key !== 'Enter' && event.key !== ' ' && shortcut === undefined) return;
      event.stopPropagation();
      if (event.repeat || shortcut !== undefined) event.preventDefault();
      if (!event.repeat) shortcut?.();
    },
  };
}

export interface CardPictureProps {
  readonly entry: CameraEntry;
  readonly hovered: boolean;
  readonly onMenu: (() => void) | undefined;
  readonly editing: boolean;
}

function Surface({
  entry,
  onMenu,
  children,
}: Pick<CardPictureProps, 'entry' | 'onMenu'> & { readonly children: ReactNode }): ReactNode {
  const router = useRouter();
  const native = isNative();
  const open: OpenPicture = (mode) => {
    router.navigate(href.camera(entry.device.id, mode));
  };
  return (
    <GestureDetector gesture={pictureGesture(open, onMenu)} touchAction="pan-y">
      <View
        {...pictureKeys(open, onMenu)}
        accessible
        tabIndex={native ? undefined : 0}
        accessibilityActions={[
          { name: 'activate' },
          { name: 'fullScreen', label: 'Full screen' },
          ...(onMenu === undefined ? [] : [{ name: 'menu', label: 'Options' }]),
        ]}
        onAccessibilityAction={(event): void => {
          const action = event.nativeEvent.actionName;
          if (action === 'activate') open(null);
          if (action === 'fullScreen') open('full');
          if (action === 'menu') onMenu?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Open ${entry.name}`}
        accessibilityHint={
          native ? 'Full screen is available in actions' : 'Double-tap for full screen'
        }
        className="absolute inset-0 web:focus-visible:outline-2 web:focus-visible:outline-focus web:focus-visible:-outline-offset-2"
      >
        {children}
      </View>
    </GestureDetector>
  );
}

function LiveCardPicture({ entry, hovered, onMenu }: Omit<CardPictureProps, 'editing'>): ReactNode {
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
    <View ref={attach} onLayout={onLayout} className="h-full w-full overflow-hidden bg-surface-2">
      <Surface entry={entry} onMenu={onMenu}>
        <PlayerStage entry={entry} live={live} compact videoFit="cover" />
      </Surface>
      {hovered && pointer ? <HoverControls entry={entry} live={live} /> : null}
    </View>
  );
}

export function CardPicture({ entry, hovered, onMenu, editing }: CardPictureProps): ReactNode {
  if (!editing) {
    return <LiveCardPicture entry={entry} hovered={hovered} onMenu={onMenu} />;
  }
  return (
    <View className="h-full w-full overflow-hidden bg-surface-2">
      <CameraSnapshot deviceId={entry.device.id} label={entry.name} fit="cover" />
    </View>
  );
}
