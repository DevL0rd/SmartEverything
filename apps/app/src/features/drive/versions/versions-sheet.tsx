import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { FileGlyph } from '../../../components/files/file-glyph';
import { IconButton } from '../../../components/icon-button';
import { Overlay, useOverlayShown } from '../../../components/overlay';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import { useSyncStatus } from '../../../store/selectors';
import { useDriveOf } from '../data';
import { entryKindOf } from '../model/item-content';
import { canWrite } from '../model/drive-access';
import { compareKindOf } from './diff-model';
import { RestoreButtons } from './restore';
import { CompareLoading, VersionCompare } from './version-compare';
import { PickCaptions, SheetTitle, TouchFooter, Unloaded } from './versions-sheet-parts';
import { OneVersion, TimelineLoading } from './version-placeholders';
import {
  COMPACT_CARD,
  CompactRow,
  SizeOverYear,
  VersionTimeline,
  useTimelineLook,
} from './version-timeline';
import { pickOf, type VersionEntry } from './versions-model';
import {
  bodyStateOf,
  footerOf,
  pairOf,
  pinnedOf,
  restorableOf,
  timelinePicksOf,
  usePicks,
  useVersionsData,
  type BodyState,
  type PanelParts,
  type VersionsSlots,
  type VersionsTarget,
} from './versions-panel';

function CompareArea({ parts }: { readonly parts: PanelParts }): ReactNode {
  const { data, look } = parts;
  const pair = pairOf(parts);
  if (pair === null) return null;
  return (
    <View className="min-h-0 flex-1 gap-3">
      <View className={cn(look.pointer && 'min-h-0 flex-1')}>
        <VersionCompare
          item={data.item}
          a={pair.a}
          b={pair.b}
          link={pair.link}
          names={pair.names}
        />
      </View>
      <PickCaptions pair={pair} look={look} />
    </View>
  );
}

function Restore({
  parts,
  b,
}: {
  readonly parts: PanelParts;
  readonly b: VersionEntry;
}): ReactNode {
  const { data, look, target } = parts;
  const access = useDriveOf(target.item).access;
  const writable = useSyncStatus().status === 'live' && canWrite(access);
  return (
    <RestoreButtons
      item={data.item}
      b={b}
      conflicted={data.conflict !== null}
      writable={writable}
      pointer={look.pointer}
      time={look.time}
      onRestored={parts.reset}
    />
  );
}

function ConflictSlot({ parts }: { readonly parts: PanelParts }): ReactNode {
  const { conflict } = parts.data;
  if (conflict === null || parts.slots.conflict === undefined) return null;
  return <View className="px-5 pb-3">{parts.slots.conflict(conflict)}</View>;
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
      pinned={parts.pinned}
      picks={timelinePicksOf(parts)}
      onPick={parts.onPick}
      look={parts.look}
      header={header}
      {...(footer === undefined ? {} : { footer })}
    />
  );
}

function OneVersionBody({ parts }: { readonly parts: PanelParts }): ReactNode {
  const { data, look, target } = parts;
  const only = data.entries[0];
  return (
    <View className="w-full max-w-reading gap-4">
      <OneVersion kept={target.versionsKept} />
      {only === undefined ? null : (
        <View className={COMPACT_CARD}>
          <CompactRow entry={only} look={look} />
        </View>
      )}
    </View>
  );
}

function PointerColumns({
  parts,
  state,
}: {
  readonly parts: PanelParts;
  readonly state: BodyState;
}): ReactNode {
  const { data, look } = parts;
  const b = restorableOf(parts);
  const settled = state === 'many';
  return (
    <View className="min-h-0 flex-1 flex-row border-t border-outline-variant">
      <View className="w-master shrink-0 border-r border-outline-variant p-3">
        {settled ? (
          <Timeline
            parts={parts}
            header={<SizeOverYear entries={data.entries} total={null} now={look.time.now} />}
          />
        ) : (
          <TimelineLoading />
        )}
      </View>
      <View className="min-w-0 flex-1 gap-3 px-5 py-4">
        {settled ? (
          <CompareArea parts={parts} />
        ) : (
          <CompareLoading lines={compareKindOf(data.item) === 'text'} />
        )}
        {settled && b !== null ? (
          <View className="flex-row flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
            <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
              {footerOf(parts, b)}
            </Text>
            <Restore parts={parts} b={b} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function PointerBody({
  parts,
  state,
}: {
  readonly parts: PanelParts;
  readonly state: BodyState;
}): ReactNode {
  if (state === 'loading' || state === 'many')
    return <PointerColumns parts={parts} state={state} />;
  return (
    <View className="min-h-0 flex-1 items-center justify-center border-t border-outline-variant p-6">
      {state === 'one' ? (
        <OneVersionBody parts={parts} />
      ) : (
        <View className="w-full max-w-reading">
          <Unloaded pages={parts.data.pages} loading={<TimelineLoading />} />
        </View>
      )}
    </View>
  );
}

function PointerPanel({
  parts,
  close,
}: {
  readonly parts: PanelParts;
  readonly close: () => void;
}): ReactNode {
  const { data } = parts;
  const shown = useOverlayShown();
  const state = bodyStateOf(parts, useSyncStatus().status === 'live');
  return (
    <View
      onLayout={shown}
      className="h-full w-full max-w-detail overflow-hidden rounded-xl bg-surface-raised elevation-3"
    >
      <View className="flex-row items-center gap-3 pb-3 pl-5 pr-3 pt-4">
        <FileGlyph kind={entryKindOf(data.item)} name={data.item.name} />
        <SheetTitle data={data} large={false} />
        <IconButton icon="close" label="Close versions" shortcut="Esc" onPress={close} />
      </View>
      <ConflictSlot parts={parts} />
      <PointerBody parts={parts} state={state} />
    </View>
  );
}

function TouchBody({
  parts,
  state,
}: {
  readonly parts: PanelParts;
  readonly state: BodyState;
}): ReactNode {
  const b = restorableOf(parts);
  if (state === 'one') {
    return (
      <View className="px-4 pt-2">
        <OneVersionBody parts={parts} />
      </View>
    );
  }
  if (state !== 'many') {
    return (
      <View className="px-4">
        <Unloaded pages={parts.data.pages} loading={<TimelineLoading />} />
      </View>
    );
  }
  return (
    <Timeline
      parts={parts}
      header={
        <View className="gap-4 px-4 pb-4 pt-2">
          <CompareArea parts={parts} />
        </View>
      }
      {...(b === null ? {} : { footer: <TouchFooter text={footerOf(parts, b)} /> })}
    />
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
  const state = bodyStateOf(parts, useSyncStatus().status === 'live');
  const b = restorableOf(parts);
  return (
    <View onLayout={shown} className="size-full bg-chrome pt-safe">
      <View className="flex-row items-center px-1">
        <IconButton icon="chevronLeft" label="Back" onPress={close} />
      </View>
      <View className="px-4 pb-2 pt-1">
        <SheetTitle data={data} large />
      </View>
      <ConflictSlot parts={parts} />
      <View className="min-h-0 flex-1">
        <TouchBody parts={parts} state={state} />
      </View>
      {state === 'many' && b !== null ? (
        <View className="gap-2 border-t border-outline-variant bg-chrome px-4 pb-safe pt-3">
          <Restore parts={parts} b={b} />
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
  const [copyShown, showCopy] = useState(true);
  const versus = target.versus === undefined || !copyShown ? null : target.versus;
  const pinned = pinnedOf(target.versus);
  const parts: PanelParts = {
    target,
    data,
    picks,
    versus,
    pinned,
    look: useTimelineLook(pinned === null ? data.entries : [...data.entries, pinned.entry]),
    slots,
    onPick: (key) => {
      if (pinned !== null && key === pinned.entry.key) {
        showCopy(true);
        return;
      }
      if (key === picks.a) return;
      choose(pickOf(versus === null ? picks : { a: picks.a, b: null }, key));
      showCopy(false);
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
