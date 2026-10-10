import type { ReactNode } from 'react';
import { Modal, View, useWindowDimensions } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { IconButton } from '../../../components/icon-button';
import { OverflowButton } from '../../../components/menu';
import { CameraDots } from './camera-dots';
import { EdgeScrim } from '../../../components/edge-scrim';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { PlayerControls } from '../player/player-controls';
import { PlayerStage } from '../player/player-stage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Dot } from '../../../components/badge';
import { QuickTogglesSheet, hasQuickToggles } from '../components/quick-toggles';
import { StreamInfoSheet } from '../player/stream-info-sheet';
import type { Viewer } from './use-viewer';

interface TopBarProps {
  readonly viewer: Viewer;
  readonly immersive: boolean;
}

function SwitchButton({
  step,
  viewer,
}: {
  readonly step: 1 | -1;
  readonly viewer: Viewer;
}): ReactNode {
  const { switchCamera } = viewer;
  const { width, height } = useWindowDimensions();
  if (switchCamera === null || height > width) {
    return null;
  }
  return (
    <IconButton
      icon={step === 1 ? 'chevronRight' : 'chevronLeft'}
      label={step === 1 ? 'Next camera' : 'Previous camera'}
      onPress={() => {
        switchCamera(step);
      }}
    />
  );
}

function PortraitDots({ deviceId }: { readonly deviceId: string }): ReactNode {
  const { width, height } = useWindowDimensions();
  return height > width ? <CameraDots deviceId={deviceId} /> : null;
}

function LeaveButton({ viewer, immersive }: TopBarProps): ReactNode {
  const router = useRouter();
  const { fullScreen } = viewer;
  if (immersive && fullScreen.manual) {
    return <IconButton icon="minimize" label="Leave full screen" onPress={fullScreen.leave} />;
  }
  return (
    <IconButton
      icon="arrowLeft"
      label="Back"
      onPress={() => {
        router.back();
      }}
    />
  );
}

const FILL = { flex: 1 };

function LiveChip(): ReactNode {
  return (
    <View className="shrink-0 flex-row items-center gap-1 rounded-full bg-black/60 px-2 py-0.5">
      <Dot tone="critical" />
      <Text variant="caption" numberOfLines={1}>
        Live
      </Text>
    </View>
  );
}

function ViewerSheets({ viewer }: { readonly viewer: Viewer }): ReactNode {
  return (
    <>
      <StreamInfoSheet
        live={viewer.live}
        open={viewer.info}
        onClose={() => {
          viewer.setInfo(false);
        }}
      />
      <QuickTogglesSheet
        entry={viewer.entry}
        open={viewer.quick}
        onClose={() => {
          viewer.setQuick(false);
        }}
      />
    </>
  );
}

function TopBar({ viewer, immersive }: TopBarProps): ReactNode {
  const router = useRouter();
  const { entry } = viewer;
  return (
    <View
      pointerEvents={viewer.hide.visible ? 'box-none' : 'none'}
      className={cn(
        'absolute inset-x-0 top-0 flex-row items-center gap-1 px-1 pb-6 pt-safe',
        viewer.hide.visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <EdgeScrim edge="top" />
      <LeaveButton viewer={viewer} immersive={immersive} />
      <SwitchButton step={-1} viewer={viewer} />
      <View className="min-w-0 shrink gap-1">
        <Text variant="title-3" numberOfLines={1} className="px-1">
          {entry.name}
        </Text>
        <PortraitDots deviceId={entry.device.id} />
      </View>
      <View className="shrink-0 grow flex-row items-center">
        {viewer.live.state.kind === 'live' ? <LiveChip /> : null}
      </View>
      <SwitchButton step={1} viewer={viewer} />
      <OverflowButton
        items={[
          {
            label: 'Stream info',
            icon: 'info',
            onPress: (): void => {
              viewer.setInfo(true);
            },
          },
          {
            label: 'Camera settings',
            icon: 'settings',
            onPress: (): void => {
              router.navigate(href.settings.camera(entry.device.id));
            },
          },
        ]}
      />
    </View>
  );
}

function Stage({
  viewer,
  immersive,
  topBar,
}: {
  readonly viewer: Viewer;
  readonly immersive: boolean;
  readonly topBar: boolean;
}): ReactNode {
  return (
    <PlayerStage
      entry={viewer.entry}
      live={viewer.live}
      compact={false}
      zoom={viewer.zoom}
      gesture={viewer.gesture}
      underBar={topBar}
    >
      <PlayerControls
        entry={viewer.entry}
        live={viewer.live}
        zoom={viewer.zoom}
        camera={viewer.camera}
        ptz={viewer.ptz}
        visible={viewer.hide.visible}
        fullScreen={immersive}
        onFullScreen={viewer.fullScreen.toggle}
        infoInMenu={topBar}
        onInfo={() => {
          viewer.setInfo(true);
        }}
        onQuick={
          hasQuickToggles(viewer.entry)
            ? (): void => {
                viewer.setQuick(true);
              }
            : null
        }
      />
      {topBar ? <TopBar viewer={viewer} immersive={immersive} /> : null}
    </PlayerStage>
  );
}

export interface ViewerPlayerProps {
  readonly viewer: Viewer;
  readonly topBar: boolean;
  readonly rounded: boolean;
}

export function ViewerPlayer({ viewer, topBar, rounded }: ViewerPlayerProps): ReactNode {
  const { fullScreen, hide } = viewer;
  const router = useRouter();
  const focused = useIsFocused();
  return (
    <>
      <View
        onPointerMove={hide.poke}
        className={cn('aspect-video w-full overflow-hidden bg-black', rounded && 'rounded-lg')}
      >
        {fullScreen.immersive ? null : <Stage viewer={viewer} immersive={false} topBar={topBar} />}
      </View>
      <Modal
        visible={focused ? fullScreen.immersive : false}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={
          fullScreen.manual
            ? fullScreen.leave
            : (): void => {
                router.back();
              }
        }
        statusBarTranslucent
        navigationBarTranslucent
      >
        <GestureHandlerRootView style={FILL}>
          <View onPointerMove={hide.poke} className="flex-1 bg-black">
            {focused && fullScreen.immersive ? <Stage viewer={viewer} immersive topBar /> : null}
          </View>
          {fullScreen.immersive ? <ViewerSheets viewer={viewer} /> : null}
        </GestureHandlerRootView>
      </Modal>
      {fullScreen.immersive ? null : <ViewerSheets viewer={viewer} />}
    </>
  );
}
