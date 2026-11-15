import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { LockedUnlocked } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../../components/banner';
import { Button } from '../../../../components/button';
import { confirm } from '../../../../components/confirm-store';
import { EmptyState } from '../../../../components/empty-state';
import { ErrorState } from '../../../../components/error-state';
import { shellLayoutOf } from '../../../../components/page-shell/layout';
import { MediaGrid } from '../../../../components/media-grid/media-grid';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../../components/media-grid/selection';
import type { ShellAction } from '../../../../components/page-shell/shell-actions';
import type { MenuItem } from '../../../../components/menu';
import { Skeleton } from '../../../../components/skeleton';
import { notify } from '../../../../components/toast-store';
import { useAreaWidth } from '../../../../design/size-class';
import { useDayKey } from '../../../../store/clock';
import { useMutationState, type MutationState } from '../../../../store/mutation';
import { useSyncStatus } from '../../../../store/selectors';
import { PhotosFrame } from '../../components/photos-frame';
import { photoKeys } from '../../data/keys';
import { LibraryLoading } from '../../library/library-states';
import { itemsText } from '../actions';
import { deleteFromLockedFolder, moveOutOfLockedFolder } from '../api';
import { useMonthFeed, type OrganiseFeed } from '../month-feed';
import { pickSlotsOf, type PickAction, type PickBarProps } from '../selection-bar';
import { LockedChangePin } from './change-pin';
import { LockedSetup, LockedUnlock } from './locked-gate';
import { lockedThumbs } from './links';
import { landingAfter } from './locked-model';
import { LockedViewer } from './locked-viewer';
import { closeLockedSession, forgetLockedSession, useLockedSession } from './session';
import { useLockedState } from '../queries';

function useLockOnLeave(open: boolean): void {
  const client = useQueryClient();
  useFocusEffect(
    useCallback(
      () => (): void => {
        closeLockedSession();
      },
      [],
    ),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') closeLockedSession();
    });
    return (): void => {
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (!open) client.removeQueries({ queryKey: photoKeys.locked() });
  }, [open, client]);
}

function Gate({ onChangePin }: { readonly onChangePin: () => void }): ReactNode {
  const state = useLockedState(true);
  if (state.isPending) {
    return (
      <View className="w-full gap-3 pt-4" accessibilityLabel="Loading the Locked folder">
        <Skeleton shape="block" className="h-72" />
      </View>
    );
  }
  if (state.isError) {
    return (
      <ErrorState
        error={state.error}
        retry={() => {
          background(state.refetch(), 'photos.locked.state_failed');
        }}
        page
      />
    );
  }
  return state.data.configured ? <LockedUnlock onChangePin={onChangePin} /> : <LockedSetup />;
}

function Empty(): ReactElement {
  return (
    <EmptyState
      icon="lock"
      title="Your Locked folder is empty"
      body="Select photos in the Library and choose Move to Locked folder. They leave every other place."
      action={<Button label="Open Library" variant="tonal" href="/photos" />}
    />
  );
}

function OpenBody({
  feed,
  controls,
  onView,
}: {
  readonly feed: OrganiseFeed;
  readonly controls: MediaSelectionControls;
  readonly onView: (itemId: string) => void;
}): ReactNode {
  const today = useDayKey();
  if (feed.state === 'loading') return <LibraryLoading />;
  if (feed.state === 'error') {
    return (
      <Banner
        tone="critical"
        title="The Locked folder closed"
        body="The hub did not accept this unlock any more. Unlock it again with your PIN."
        wrapBody
        action={{ label: 'Unlock again', onPress: forgetLockedSession }}
      />
    );
  }
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <MediaGrid
        tiles={feed.tiles}
        step="days"
        today={today}
        empty={<Empty />}
        thumbs={lockedThumbs}
        selection={controls.selection}
        onDay={controls.day}
        onOpen={(tile) => {
          if (!controls.press(tile.id, { shift: false })) onView(tile.id);
        }}
        onMenu={(tile) => {
          controls.pick(tile.id);
        }}
        onEndReached={feed.onEnd}
      />
    </View>
  );
}

async function deleteLocked(
  session: LockedUnlocked,
  mutation: MutationState,
  ids: readonly string[],
  done: () => void,
): Promise<void> {
  const accepted = await confirm({
    title: `Delete ${itemsText(ids.length)} for good?`,
    body: 'They are deleted at once and never go to a trash. This cannot be undone.',
    confirmLabel: 'Delete',
    tone: 'destructive',
  });
  if (!accepted) return;
  mutation.run(() => deleteFromLockedFolder(session.token, ids), {
    failure: 'Nothing was deleted',
    label: 'photos.locked.delete',
    onDone: (changed) => {
      notify({ message: `${itemsText(changed.count)} deleted` });
      done();
    },
  });
}

function pickActions(
  session: LockedUnlocked,
  ids: readonly string[],
  mutation: MutationState,
  done: () => void,
): readonly PickAction[] {
  return [
    {
      id: 'move-out',
      label: 'Move out',
      short: 'Move out',
      icon: 'lockOpen',
      look: 'primary',
      onPress: (): void => {
        mutation.run(() => moveOutOfLockedFolder(session.token, ids), {
          failure: 'Nothing left the Locked folder',
          label: 'photos.locked.move_out',
          onDone: (changed) => {
            notify({ message: `${itemsText(changed.count)} back in the library` });
            done();
          },
        });
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      short: 'Delete',
      icon: 'trash',
      look: 'destructive',
      onPress: (): void => {
        background(deleteLocked(session, mutation, ids, done), 'photos.locked.delete_failed');
      },
    },
  ];
}

function Viewing({
  session,
  feed,
  mutation,
  live,
  itemId,
  onView,
}: {
  readonly session: LockedUnlocked;
  readonly feed: OrganiseFeed;
  readonly mutation: MutationState;
  readonly live: boolean;
  readonly itemId: string | null;
  readonly onView: (itemId: string | null) => void;
}): ReactNode {
  if (itemId === null) return null;
  const close = (): void => {
    onView(null);
  };
  return (
    <LockedViewer
      tiles={feed.tiles}
      itemId={itemId}
      actions={pickActions(session, [itemId], mutation, () => {
        onView(landingAfter(feed.tiles, itemId));
      })}
      busy={!live || mutation.busy}
      onGo={onView}
      onClose={close}
    />
  );
}

function openActions(feed: OrganiseFeed, controls: MediaSelectionControls): readonly ShellAction[] {
  return [
    { icon: 'lock', label: 'Lock', primary: true, onPress: closeLockedSession },
    ...(feed.tiles.length === 0
      ? []
      : [
          {
            icon: 'circleCheck' as const,
            label: 'Select',
            iconOnly: true,
            onPress: controls.begin,
          },
        ]),
  ];
}

function barOf({
  session,
  feed,
  controls,
  mutation,
  live,
}: {
  readonly session: LockedUnlocked;
  readonly feed: OrganiseFeed;
  readonly controls: MediaSelectionControls;
  readonly mutation: MutationState;
  readonly live: boolean;
}): PickBarProps {
  const ids = [...controls.selection.ids];
  return {
    picked: ids.length,
    total: feed.total,
    disabled: !live || mutation.busy,
    actions: pickActions(session, ids, mutation, controls.clear),
    onClear: controls.clear,
    onAll: (): void => {
      feed.loadAll();
      controls.all();
    },
  };
}

function changePinItem(onChangePin: () => void): MenuItem {
  return { id: 'change-pin', label: 'Change PIN', icon: 'key', onPress: onChangePin };
}

function Opened({
  session,
  onChangePin,
}: {
  readonly session: LockedUnlocked;
  readonly onChangePin: () => void;
}): ReactNode {
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const live = useSyncStatus().status === 'live';
  const feed = useMonthFeed({ kind: 'locked', token: session.token });
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const mutation = useMutationState();
  const [viewing, setViewing] = useState<string | null>(null);
  const bar = barOf({ session, feed, controls, mutation, live });
  const active = controls.selection.active;
  return (
    <PhotosFrame
      active="locked"
      subtitle={
        feed.state === 'ready'
          ? `${itemsText(feed.total)} · locks when you leave`
          : 'Locks when you leave'
      }
      scroll={false}
      actions={active ? [] : openActions(feed, controls)}
      overflow={active ? [] : [changePinItem(onChangePin)]}
      {...pickSlotsOf(bar, active, compact)}
    >
      {feed.sources}
      <OpenBody feed={feed} controls={controls} onView={setViewing} />
      <Viewing
        session={session}
        feed={feed}
        mutation={mutation}
        live={live}
        itemId={viewing}
        onView={setViewing}
      />
    </PhotosFrame>
  );
}

export function LockedScreen(): ReactNode {
  const session = useLockedSession();
  const [changing, setChanging] = useState(false);
  useLockOnLeave(session !== null);
  const changePin = (): void => {
    setChanging(true);
  };
  if (changing) {
    return (
      <PhotosFrame active="locked" subtitle="Private, behind your PIN" refresh={false}>
        <LockedChangePin
          onDone={() => {
            setChanging(false);
          }}
        />
      </PhotosFrame>
    );
  }
  if (session !== null) return <Opened session={session} onChangePin={changePin} />;
  return (
    <PhotosFrame active="locked" subtitle="Private, behind your PIN" refresh={false}>
      <Gate onChangePin={changePin} />
    </PhotosFrame>
  );
}
