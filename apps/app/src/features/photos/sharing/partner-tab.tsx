import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { LibraryScope, PartnerShare } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import type { MediaGrouping } from '../../../components/media-grid/tiles';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { count } from '../../../format/number';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { LibraryGrid } from '../library/library-grid';
import { LibraryShell, type LibraryHeadProps, type ZoomControl } from '../library/library-head';
import { LibraryError, LibraryLoading } from '../library/library-states';
import { useClearOnChange } from '../library/use-clear-on-change';
import { scopeKeyOf, useLibraryFeed, type LibraryFeed } from '../library/use-library-feed';
import { useMediaActions } from '../library/use-media-actions';
import { savePartnerPhotos, setPartnerAutoSave } from './api';
import { invalidateSharing, usePhotoSharing } from './queries';

export interface PartnerTabProps {
  readonly head: LibraryHeadProps;
  readonly shareId: string;
  readonly name: string;
  readonly scope: LibraryScope;
  readonly zoom: ZoomControl;
  readonly grouping: MediaGrouping;
}

export function savedText(saved: number, asked: number): string {
  if (saved === 0)
    return asked === 1
      ? 'That photo is already in your library'
      : 'These photos are already in your library';
  return `Saved ${count(saved)} ${saved === 1 ? 'photo' : 'photos'} to your library`;
}

function save(
  mutation: MutationState,
  shareId: string,
  controls: MediaSelectionControls,
  refresh: () => void,
): void {
  const ids = [...controls.selection.ids];
  mutation.run(() => savePartnerPhotos(shareId, ids), {
    failure: 'The photos were not saved',
    label: 'photos.partner.save',
    onDone: (result) => {
      notify({ message: savedText(result.saved, ids.length) });
      controls.clear();
      refresh();
    },
  });
}

function SelectionBar({
  shareId,
  controls,
}: {
  readonly shareId: string;
  readonly controls: MediaSelectionControls;
}): ReactElement {
  const mutation = useMutationState();
  const client = useQueryClient();
  const picked = controls.selection.ids.size;
  return (
    <View className="min-h-14 flex-row flex-wrap items-center gap-2 px-gutter py-2">
      <IconButton icon="x" label="Cancel selection" onPress={controls.clear} />
      <Text variant="label" className="min-w-0 flex-1 tabular-nums">
        {picked === 0 ? 'Select photos to save' : `${count(picked)} selected`}
      </Text>
      <Button
        label="Save to my library"
        icon="download"
        variant="filled"
        disabled={picked === 0}
        loading={mutation.busy}
        onPress={() => {
          save(mutation, shareId, controls, () => {
            invalidateSharing(client);
          });
        }}
      />
    </View>
  );
}

function AutoSaveRow({
  share,
  name,
}: {
  readonly share: PartnerShare | undefined;
  readonly name: string;
}): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  if (share === undefined) return null;
  return (
    <View className="mx-gutter mb-2 rounded-lg border-hairline border-outline-variant bg-surface-1 px-2">
      <SwitchRow
        title="Auto-save to my library"
        subtitle={`Every new photo ${name} shares lands in your library. Select photos to save older ones.`}
        wrapSubtitle
        value={share.autoSave}
        disabled={mutation.busy}
        onChange={(on) => {
          mutation.run(() => setPartnerAutoSave(share.id, on), {
            failure: 'Auto-save did not change',
            label: 'photos.partner.auto_save',
            onDone: () => {
              invalidateSharing(client);
            },
          });
        }}
      />
    </View>
  );
}

function Body({
  page,
  feed,
  controls,
}: {
  readonly page: PartnerTabProps;
  readonly feed: LibraryFeed;
  readonly controls: MediaSelectionControls;
}): ReactNode {
  const media = useMediaActions();
  if (feed.state === 'error' && feed.tiles.length === 0)
    return <LibraryError onRetry={feed.retry} />;
  if (feed.state === 'loading' && feed.tiles.length === 0) return <LibraryLoading />;
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <LibraryGrid
        tiles={feed.tiles}
        step={page.zoom.step}
        onStep={page.zoom.onStep}
        selection={controls}
        media={media}
        grouping={page.grouping}
        empty={
          <EmptyState
            icon="users"
            title={`No photos from ${page.name} yet`}
            body="Photos they share from the start day show up here as they take them."
          />
        }
        footer={<View />}
        onEnd={feed.onEnd}
      />
    </View>
  );
}

export function PartnerTab(props: PartnerTabProps): ReactNode {
  const feed = useLibraryFeed(props.scope);
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  useClearOnChange(scopeKeyOf(props.scope), controls.clear);
  const share = usePhotoSharing().data?.partners.find((entry) => entry.id === props.shareId);
  return (
    <LibraryShell
      head={props.head}
      frame={{
        subtitle: `Shared with you by ${props.name}`,
        actions: [
          { icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin },
        ],
        selection: controls.selection.active ? (
          <SelectionBar shareId={props.shareId} controls={controls} />
        ) : null,
        banner: null,
      }}
    >
      <AutoSaveRow share={share} name={props.name} />
      <Body page={props} feed={feed} controls={controls} />
    </LibraryShell>
  );
}
