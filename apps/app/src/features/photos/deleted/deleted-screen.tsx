import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import type { HeaderAction } from '../../../components/page-header';
import { Skeleton } from '../../../components/skeleton';
import {
  beginSelecting,
  NO_SELECTION,
  toggleDay,
  toggleItem,
  type MediaSelection,
} from '../../../components/media-grid/selection';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { useAreaWidth } from '../../../design/size-class';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { PhotosFrame } from '../components/photos-frame';
import { useDeletedActions, type DeletedActions } from './actions';
import { MEMBER_NOTE, OWNER_NOTE, READ_ONLY_NOTE, subtitleOf } from './copy';
import { DeletedGrid } from './deleted-grid';
import type { TileHandlers } from './deleted-tile';
import { LeavingCard } from './leaving-card';
import { pickedOf, totalsOf, type DeletedItem } from './model';
import { SelectionHeader } from './selection-header';
import { useDeleted, type DeletedView } from './use-deleted';

function Note({ text }: { readonly text: string }): ReactNode {
  return (
    <View className="flex-row items-start gap-2">
      <Icon name="info" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {text}
      </Text>
    </View>
  );
}

function Notes({ owner }: { readonly owner: boolean }): ReactNode {
  return (
    <View className="gap-2">
      <Note text={owner ? OWNER_NOTE : MEMBER_NOTE} />
      {owner ? <Note text={READ_ONLY_NOTE} /> : null}
    </View>
  );
}

function Loading(): ReactNode {
  return (
    <View className="gap-3" accessibilityLabel="Loading Recently deleted">
      <Skeleton shape="block" className="h-36" />
      <Skeleton shape="text" className="w-40" />
      <View className="flex-row gap-0.75">
        <Skeleton shape="tile" className="h-36 flex-1" />
        <Skeleton shape="tile" className="h-36 flex-1" />
        <Skeleton shape="tile" className="h-36 flex-1" />
      </View>
    </View>
  );
}

function Empty({ owner }: { readonly owner: boolean }): ReactNode {
  return (
    <View className="flex-1 justify-center gap-6">
      <EmptyState
        icon="trash"
        title="Nothing in Recently deleted"
        body="Photos and videos you delete stay here for a year, then leave for good."
        action={<Button label="Open Timeline" variant="tonal" href="/photos" />}
      />
      <Notes owner={owner} />
    </View>
  );
}

interface Body {
  readonly view: DeletedView;
  readonly owner: boolean;
  readonly compact: boolean;
  readonly disabled: boolean;
  readonly selection: MediaSelection;
  readonly setSelection: (update: (selection: MediaSelection) => MediaSelection) => void;
  readonly actions: DeletedActions;
}

function handlersOf(body: Body): TileHandlers {
  const { actions, owner, disabled, setSelection } = body;
  return {
    onPress: (item): void => {
      setSelection((selection) => toggleItem(selection, item.id));
    },
    onRestore: (item): void => {
      actions.restore([item]);
    },
    onDeleteNow: owner
      ? (item: DeletedItem): void => {
          actions.deleteNow([item]);
        }
      : null,
    disabled,
  };
}

function Content(body: Body): ReactNode {
  const { view, owner, disabled, actions } = body;
  if (view.status === 'loading') return <Loading />;
  if (view.status === 'error') return <ErrorState error={view.error} retry={view.retry} page />;
  if (view.items.length === 0) return <Empty owner={owner} />;
  const whole = disabled || !view.complete;
  return (
    <DeletedGrid
      days={view.days}
      today={view.today}
      selection={body.selection}
      onSelectDay={(ids) => {
        body.setSelection((selection) => toggleDay(selection, ids));
      }}
      {...handlersOf(body)}
      header={
        <LeavingCard
          totals={view.totals}
          months={view.months}
          actions={{
            compact: body.compact,
            disabled: whole,
            onRestoreAll: () => {
              actions.restore(view.items);
            },
            onDeleteAll: owner
              ? (): void => {
                  actions.deleteAll(view.items);
                }
              : null,
          }}
        />
      }
      footer={<Notes owner={owner} />}
    />
  );
}

function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Offline · showing the last snapshot"
      body="Restoring and deleting need your home hub."
      wrapBody
    />
  );
}

function selectAction(view: DeletedView, start: () => void): readonly HeaderAction[] {
  return view.items.length === 0 ? [] : [{ icon: 'circleCheck', label: 'Select', onPress: start }];
}

function SelectionBar({
  body,
  onClear,
}: {
  readonly body: Body;
  readonly onClear: () => void;
}): ReactElement {
  const picked = pickedOf(body.view.items, body.selection.ids);
  return (
    <SelectionHeader
      picked={totalsOf(picked)}
      disabled={body.disabled}
      onClear={onClear}
      onRestore={() => {
        body.actions.restore(picked);
      }}
      onDeleteNow={
        body.owner
          ? (): void => {
              body.actions.deleteNow(picked);
            }
          : null
      }
    />
  );
}

export function DeletedScreen(): ReactNode {
  const owner = useIsOwner();
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const live = useSyncStatus().status === 'live';
  const view = useDeleted();
  const [selection, setSelection] = useState<MediaSelection>(NO_SELECTION);
  const clear = (): void => {
    setSelection(NO_SELECTION);
  };
  const actions = useDeletedActions(clear);
  const body: Body = {
    view,
    owner,
    compact,
    disabled: !live || actions.busy,
    selection,
    setSelection,
    actions,
  };
  useEscape(selection.active, clear);
  return (
    <PhotosFrame
      active="deleted"
      subtitle={subtitleOf(view.totals, compact)}
      scroll={false}
      actions={
        selection.active
          ? []
          : selectAction(view, () => {
              setSelection(beginSelecting);
            })
      }
      selection={selection.active ? <SelectionBar body={body} onClear={clear} /> : null}
      {...(live ? {} : { banner: <OfflineBanner /> })}
    >
      <Content {...body} />
    </PhotosFrame>
  );
}
