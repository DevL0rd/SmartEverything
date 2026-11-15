import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { PhotoEdit } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { ToastModal } from '../../../components/toast-modal';
import { ThemeScope } from '../../../design/theme-scope';
import type { MediaItem } from '../viewer/info-model';
import { useViewerItem } from '../viewer/use-viewer-item';
import type { Size } from './geometry';
import { editItemOf } from './params';
import { PhotoEditorView } from './photo-editor';
import { useKeptPatches, usePhotoEdit, usePhotoEditBase } from './queries';
import { requestLeave } from './use-photo-editor';
import { VideoEditorView } from './video-editor';

export function sourceSizeOf(item: MediaItem): Size {
  if (item.width === null || item.height === null) return { width: 1, height: 1 };
  const sideways = item.orientation !== null && item.orientation >= 5;
  return sideways
    ? { width: item.height, height: item.width }
    : { width: item.width, height: item.height };
}

function Frame({
  itemId,
  children,
}: {
  readonly itemId: string | null;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="flex-1 bg-black">
      <View className="h-16 flex-row items-center px-2 pt-safe">
        <IconButton
          icon="close"
          label="Close the editor"
          onPress={() => {
            requestLeave(itemId);
          }}
        />
      </View>
      <View className="flex-1 items-center justify-center p-6">{children}</View>
    </View>
  );
}

function Waiting({ label }: { readonly label: string }): ReactNode {
  return (
    <View className="items-center gap-3" accessible accessibilityLabel={label}>
      <ActivityIndicator size="large" colorClassName="accent-primary" />
      <Text variant="callout" tone="variant">
        {label}
      </Text>
    </View>
  );
}

function PhotoSource({
  item,
  edit,
}: {
  readonly item: MediaItem;
  readonly edit: PhotoEdit;
}): ReactNode {
  const base = usePhotoEditBase(item.id, item.rev);
  const kept = useKeptPatches(
    item.id,
    (edit.recipe?.patches ?? []).map((patch) => patch.patchId),
  );
  if (base.data !== undefined && kept.images !== null) {
    return (
      <PhotoEditorView
        key={item.rev}
        item={item}
        edit={edit}
        uri={base.data.image}
        patchImages={kept.images}
        initialSource={sourceSizeOf(item)}
      />
    );
  }
  const failure = base.isError ? base.error : kept.error;
  return (
    <Frame itemId={item.id}>
      {base.isError || kept.error !== null ? (
        <ErrorState
          error={failure}
          retry={() => {
            if (base.isError) background(base.refetch(), 'photos.editor.retry_failed');
            kept.retry();
          }}
          page
        />
      ) : (
        <Waiting label="Loading the original" />
      )}
    </Frame>
  );
}

function PhotoEditorLoader({ item }: { readonly item: MediaItem }): ReactNode {
  const edit = usePhotoEdit(item.id);
  if (edit.data?.canEdit === false) {
    return (
      <Frame itemId={item.id}>
        <EmptyState
          icon="fileText"
          title="You cannot edit this photo"
          body={edit.data.copyOnlyReason ?? 'You can only view it.'}
        />
      </Frame>
    );
  }
  if (edit.data !== undefined) return <PhotoSource item={item} edit={edit.data} />;
  return (
    <Frame itemId={item.id}>
      {edit.isError ? (
        <ErrorState
          error={edit.error}
          retry={() => {
            background(edit.refetch(), 'photos.editor.retry_failed');
          }}
          page
        />
      ) : (
        <Waiting label="Opening the editor" />
      )}
    </Frame>
  );
}

function EditorBody({ itemId }: { readonly itemId: string }): ReactNode {
  const viewer = useViewerItem(itemId);
  if (viewer.state === 'ready') {
    return viewer.item.kind === 'video' ? (
      <VideoEditorView item={viewer.item} media={viewer.media} />
    ) : (
      <PhotoEditorLoader item={viewer.item} />
    );
  }
  return (
    <Frame itemId={itemId}>
      {viewer.state === 'error' ? (
        <ErrorState error={viewer.error} retry={viewer.retry} page />
      ) : viewer.state === 'not-media' ? (
        <EmptyState
          icon="fileText"
          title="Not a photo or video"
          body="Only photos and videos open in the editor."
        />
      ) : (
        <Waiting label="Opening the editor" />
      )}
    </Frame>
  );
}

export function EditorScreen(): ReactNode {
  const itemId = editItemOf(useLocalSearchParams());
  return (
    <ToastModal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        requestLeave(itemId);
      }}
    >
      <ThemeScope theme="dark">
        {itemId === null ? (
          <Frame itemId={null}>
            <EmptyState
              icon="image"
              title="This edit link is not valid"
              body="Open the photo again from Photos."
            />
          </Frame>
        ) : (
          <EditorBody itemId={itemId} />
        )}
      </ThemeScope>
    </ToastModal>
  );
}
