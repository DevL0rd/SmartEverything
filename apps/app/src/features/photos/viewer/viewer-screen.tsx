import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { IconButton } from '../../../components/icon-button';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { Skeleton } from '../../../components/skeleton';
import { ToastModal } from '../../../components/toast-modal';
import { useEscape } from '../../../components/use-escape';
import { ThemeScope } from '../../../design/theme-scope';
import { useIsPhone } from '../../../design/size-class';
import { useSyncStatus } from '../../../store/selectors';
import { LocalViewer } from './local-viewer';
import { closeViewer } from './close';
import { viewerParamsOf, viewerTargetOf, type ViewerTarget } from './params';
import { ReadyViewer } from './ready-viewer';
import { useViewerItem, type ViewerItem } from './use-viewer-item';

export function isOffline(status: ReturnType<typeof useSyncStatus>['status']): boolean {
  return status === 'interrupted' || status === 'refused';
}

function Frame({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <ThemeScope theme="dark">
      <View className="flex-1 bg-black">
        <View className="h-16 flex-row items-center px-4 pt-safe">
          <IconButton icon="arrowLeft" label="Close viewer" onPress={closeViewer} shortcut="Esc" />
        </View>
        <View className="flex-1 items-center justify-center p-6">{children}</View>
      </View>
    </ThemeScope>
  );
}

function Waiting({
  viewer,
}: {
  readonly viewer: Exclude<ViewerItem, { readonly state: 'ready' }>;
}): ReactNode {
  const offline = isOffline(useSyncStatus().status);
  if (viewer.state === 'loading' && !offline) {
    return <Skeleton shape="block" className="h-2/3 w-full max-w-3xl rounded-none bg-surface-2" />;
  }
  if (offline) {
    return (
      <EmptyState
        icon="wifiOff"
        title="The hub is offline"
        body="This photo shows here when the hub is back."
      />
    );
  }
  if (viewer.state === 'error')
    return <ErrorState error={viewer.error} retry={viewer.retry} page />;
  return (
    <EmptyState
      icon="fileText"
      title="Not a photo or video"
      body="This file opens in Drive."
      action={<Button label="Open Drive" variant="tonal" href={href.drive()} />}
    />
  );
}

function ViewerBody({ target }: { readonly target: ViewerTarget }): ReactNode {
  const viewer = useViewerItem(target.itemId);
  const phone = useIsPhone();
  const [infoOpen, setInfoOpen] = useState(!phone);
  if (viewer.state !== 'ready') {
    return (
      <Frame>
        <Waiting viewer={viewer} />
      </Frame>
    );
  }
  const open = (itemId: string): void => {
    router.setParams({ itemId, ...viewerParamsOf(target.scope) });
  };
  return (
    <ReadyViewer
      key={viewer.item.id}
      viewer={viewer}
      scope={target.scope}
      phone={phone}
      infoOpen={infoOpen}
      onInfo={() => {
        setInfoOpen((value) => !value);
      }}
      onOpen={open}
      onGo={(tile: MediaTile) => {
        open(tile.id);
      }}
    />
  );
}

export function ViewerScreen(): ReactNode {
  const target = viewerTargetOf(useLocalSearchParams());
  useEscape(true, closeViewer);
  return (
    <ToastModal visible animationType="fade" onRequestClose={closeViewer} statusBarTranslucent>
      {target === null ? (
        <Frame>
          <EmptyState
            icon="image"
            title="This photo link is not valid"
            body="Open the photo again from Photos."
          />
        </Frame>
      ) : target.itemId.startsWith('local:') ? (
        <LocalViewer key={target.itemId} id={target.itemId.slice('local:'.length)} />
      ) : (
        <ViewerBody target={target} />
      )}
    </ToastModal>
  );
}
