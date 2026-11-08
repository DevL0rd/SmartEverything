import type { ReactElement, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { DriveConflict, DriveItem, DriveRoot } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { FileGlyph } from '../../../components/files/file-glyph';
import { IconButton } from '../../../components/icon-button';
import { Overlay, useOverlayShown } from '../../../components/overlay';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveConflicts, useDriveItem, useDriveVersions } from '../../nas/data';
import { entryKindOf } from '../folder/folder-list';
import { RestoreButtons } from './restore';
import {
  OneVersion,
  SizeOverYear,
  TimelineLoading,
  VersionTimeline,
  useTimelineLook,
  type TimelineLook,
} from './version-timeline';
import {
  captionOf,
  entriesOf,
  entryOf,
  initialPicks,
  openConflictOf,
  pickOf,
  restorePlanOf,
  settlePicks,
  totalOf,
  totalText,
  type VersionEntry,
  type VersionPicks,
} from './versions-model';

export interface VersionsTarget {
  readonly root: DriveRoot;
  readonly item: DriveItem;
  readonly picks?: VersionPicks;
}

export interface CompareInput {
  readonly item: DriveItem;
  readonly a: VersionEntry;
  readonly b: VersionEntry;
}

export interface VersionsSlots {
  readonly compare?: (input: CompareInput) => ReactNode;
  readonly conflict?: (conflict: DriveConflict) => ReactNode;
}

interface VersionsData {
  readonly item: DriveItem;
  readonly entries: readonly VersionEntry[];
  readonly settled: boolean;
  readonly pages: ReturnType<typeof useDriveVersions>;
  readonly conflict: DriveConflict | null;
}

function useVersionsData(target: VersionsTarget): VersionsData {
  const live = useDriveItem(target.item.id, target.item.rootId).data;
  const item = live ?? target.item;
  const pages = useDriveVersions(item.id, item.rootId);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    fetchNextPage().catch(notifyFailure('Earlier versions could not be read.'));
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const conflicts = flattenPages(useDriveConflicts(item.rootId).data, (page) => page.items);
  const versions = flattenPages(pages.data, (page) => page.items);
  return {
    item,
    entries: entriesOf(item, versions),
    settled: pages.data !== undefined && !hasNextPage,
    pages,
    conflict: openConflictOf(conflicts, item.id),
  };
}

function usePicks(
  initial: VersionPicks | undefined,
  entries: readonly VersionEntry[],
): readonly [VersionPicks, (next: VersionPicks | null) => void] {
  const [chosen, choose] = useState<VersionPicks | null>(initial ?? null);
  return [settlePicks(chosen ?? initialPicks(entries), entries), choose];
}

function PickCaptions({
  a,
  b,
  look,
}: {
  readonly a: VersionEntry;
  readonly b: VersionEntry;
  readonly look: TimelineLook;
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {`A · ${captionOf(a, look.namers, look.time)}`}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {`B · ${captionOf(b, look.namers, look.time)}`}
      </Text>
    </View>
  );
}

interface PanelParts {
  readonly target: VersionsTarget;
  readonly data: VersionsData;
  readonly picks: VersionPicks;
  readonly look: TimelineLook;
  readonly slots: VersionsSlots;
  readonly onPick: (key: string) => void;
  readonly reset: () => void;
}

function CompareArea({ parts }: { readonly parts: PanelParts }): ReactNode {
  const { data, picks, look, slots } = parts;
  const a = entryOf(data.entries, picks.a);
  const b = entryOf(data.entries, picks.b);
  if (a === null || b === null) return <OneVersion root={parts.target.root} />;
  return (
    <View className="min-h-0 flex-1 gap-3">
      {slots.compare === undefined ? null : (
        <View className="min-h-0 flex-1">{slots.compare({ item: data.item, a, b })}</View>
      )}
      <PickCaptions a={a} b={b} look={look} />
    </View>
  );
}

function Restore({ parts }: { readonly parts: PanelParts }): ReactNode {
  const { data, picks, look, target } = parts;
  const writable = useSyncStatus().status === 'live' && !target.root.readOnly;
  return (
    <RestoreButtons
      item={data.item}
      b={entryOf(data.entries, picks.b)}
      conflicted={data.conflict !== null}
      writable={writable}
      pointer={look.pointer}
      onRestored={parts.reset}
    />
  );
}

function footerOf(parts: PanelParts): string {
  const b = entryOf(parts.data.entries, parts.picks.b);
  return restorePlanOf(b, parts.data.conflict !== null).footer;
}

function Unloaded({ data }: { readonly data: VersionsData }): ReactNode {
  const live = useSyncStatus().status === 'live';
  if (!live) {
    return (
      <EmptyState
        compact
        icon="wifiOff"
        title="The hub is offline"
        body="Versions come back when the hub reconnects. Nothing is lost while it is away."
      />
    );
  }
  if (data.pages.isError) {
    return (
      <ErrorState
        error={data.pages.error}
        retry={() => {
          background(data.pages.refetch(), 'drive_versions.refetch_failed');
        }}
      />
    );
  }
  return <TimelineLoading />;
}

function ConflictSlot({ parts }: { readonly parts: PanelParts }): ReactNode {
  const { conflict } = parts.data;
  if (conflict === null || parts.slots.conflict === undefined) return null;
  return <View className="px-5 pb-3">{parts.slots.conflict(conflict)}</View>;
}

function Title({
  parts,
  large,
}: {
  readonly parts: PanelParts;
  readonly large: boolean;
}): ReactNode {
  const { data } = parts;
  const subtitle = data.settled
    ? `${data.item.name} · ${totalText(totalOf(data.entries))}`
    : data.item.name;
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant={large ? 'large-title' : 'title-3'} role="heading" numberOfLines={1}>
        Versions
      </Text>
      <Text variant={large ? 'callout' : 'footnote'} tone="variant" numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
  );
}

function Timeline({
  parts,
  header,
  footer,
}: {
  readonly parts: PanelParts;
  readonly header: ReactElement;
  readonly footer?: ReactElement;
}): ReactNode {
  return (
    <VersionTimeline
      entries={parts.data.entries}
      picks={parts.picks}
      onPick={parts.onPick}
      look={parts.look}
      header={header}
      {...(footer === undefined ? {} : { footer })}
    />
  );
}

function PointerPanel({
  parts,
  close,
}: {
  readonly parts: PanelParts;
  readonly close: () => void;
}): ReactNode {
  const { data, look } = parts;
  const shown = useOverlayShown();
  const total = totalText(totalOf(data.entries));
  return (
    <View
      onLayout={shown}
      className="h-full w-full max-w-detail overflow-hidden rounded-xl bg-surface-raised elevation-3"
    >
      <View className="flex-row items-center gap-3 pb-3 pl-5 pr-3 pt-4">
        <FileGlyph kind={entryKindOf(data.item)} name={data.item.name} />
        <Title parts={parts} large={false} />
        <IconButton icon="close" label="Close versions" shortcut="Esc" onPress={close} />
      </View>
      <ConflictSlot parts={parts} />
      <View className="min-h-0 flex-1 flex-row border-t border-outline-variant">
        <View className="w-master shrink-0 border-r border-outline-variant p-3">
          {data.settled ? (
            <Timeline
              parts={parts}
              header={<SizeOverYear entries={data.entries} total={total} now={look.time.now} />}
            />
          ) : (
            <Unloaded data={data} />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-3 px-5 py-4">
          {data.settled ? <CompareArea parts={parts} /> : <View className="flex-1" />}
          <View className="flex-row flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
            <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
              {footerOf(parts)}
            </Text>
            {data.settled ? <Restore parts={parts} /> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function TouchPanel({
  parts,
  close,
}: {
  readonly parts: PanelParts;
  readonly close: () => void;
}): ReactNode {
  const { data } = parts;
  const shown = useOverlayShown();
  return (
    <View onLayout={shown} className="size-full bg-chrome pt-safe">
      <View className="flex-row items-center px-1">
        <IconButton icon="chevronLeft" label="Back" onPress={close} />
      </View>
      <View className="px-4 pb-2 pt-1">
        <Title parts={parts} large />
      </View>
      <ConflictSlot parts={parts} />
      <View className="min-h-0 flex-1">
        {data.settled ? (
          <Timeline
            parts={parts}
            header={
              <View className="gap-4 px-4 pb-4 pt-2">
                <CompareArea parts={parts} />
              </View>
            }
            footer={
              <Text variant="footnote" tone="variant" className="px-4 py-4">
                {footerOf(parts)}
              </Text>
            }
          />
        ) : (
          <Unloaded data={data} />
        )}
      </View>
      {data.settled ? (
        <View className="gap-2 border-t border-outline-variant bg-chrome px-4 pb-safe pt-3">
          <Restore parts={parts} />
        </View>
      ) : null}
    </View>
  );
}

function Panel({
  target,
  slots,
  touch,
  close,
}: {
  readonly target: VersionsTarget;
  readonly slots: VersionsSlots;
  readonly touch: boolean;
  readonly close: () => void;
}): ReactNode {
  const data = useVersionsData(target);
  const [picks, choose] = usePicks(target.picks, data.entries);
  const parts: PanelParts = {
    target,
    data,
    picks,
    look: useTimelineLook(data.entries),
    slots,
    onPick: (key) => {
      choose(pickOf(picks, key));
    },
    reset: () => {
      choose(null);
    },
  };
  return touch ? (
    <TouchPanel parts={parts} close={close} />
  ) : (
    <PointerPanel parts={parts} close={close} />
  );
}

export interface VersionsSheetProps {
  readonly target: VersionsTarget | null;
  readonly onClose: () => void;
  readonly slots?: VersionsSlots;
}

const NO_SLOTS: VersionsSlots = {};

export function VersionsSheet({
  target,
  onClose,
  slots = NO_SLOTS,
}: VersionsSheetProps): ReactNode {
  const touch = useSizeClass().sheet === 'bottom';
  return (
    <Overlay
      open={target !== null}
      onClose={onClose}
      label="Versions"
      scrim
      className={cn(touch ? '' : 'items-end p-4')}
    >
      {target === null ? null : (
        <Panel key={target.item.id} target={target} slots={slots} touch={touch} close={onClose} />
      )}
    </Overlay>
  );
}
