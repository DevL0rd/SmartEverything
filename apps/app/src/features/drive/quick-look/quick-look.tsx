import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import type { DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { IconButton } from '../../../components/icon-button';
import { Overlay, useOverlayShown } from '../../../components/overlay';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import { useScopeVisible } from '../../../design/visibility';
import { driveLinks } from '../data';
import { QuickLookContent } from './quick-look-content';
import { QuickLookHeader } from './quick-look-header';
import { useQuickLookKeys } from './quick-look-keys';
import {
  detailsOnInfo,
  placeOf,
  positionText,
  stepOf,
  type QuickLookKey,
  type QuickLookPlace,
  type QuickLookTarget,
} from './quick-look-model';

const log = new Logger('app.drive');

function prefetch(item: DriveItem): void {
  if (item.kind === 'folder' || item.thumb.state !== 'ready') return;
  driveLinks
    .resolve(item.id, item.rev, 'preview')
    .then((url) => (url === null ? false : Image.prefetch(url, 'disk')))
    .catch((error: unknown) => {
      log.warn('quick_look.prefetch_failed', { reason: String(error) });
    });
}

function usePrefetchNeighbours(place: QuickLookPlace): void {
  const visible = useScopeVisible();
  const before = visible ? place.previous : null;
  const after = visible ? place.next : null;
  useEffect(() => {
    if (before !== null) prefetch(before);
  }, [before]);
  useEffect(() => {
    if (after !== null) prefetch(after);
  }, [after]);
}

function Step({
  side,
  item,
  onGo,
}: {
  readonly side: 'previous' | 'next';
  readonly item: DriveItem | null;
  readonly onGo: (item: DriveItem) => void;
}): ReactNode {
  return (
    <IconButton
      icon={side === 'previous' ? 'chevronLeft' : 'chevronRight'}
      label={side === 'previous' ? 'Previous file' : 'Next file'}
      variant="raised"
      disabled={item === null}
      shortcut={side === 'previous' ? '←' : '→'}
      onPress={() => {
        if (item !== null) onGo(item);
      }}
    />
  );
}

function Stage({
  item,
  place,
  touch,
  onGo,
}: {
  readonly item: DriveItem;
  readonly place: QuickLookPlace;
  readonly touch: boolean;
  readonly onGo: (item: DriveItem) => void;
}): ReactNode {
  if (touch) {
    return (
      <View className="min-h-0 flex-1 items-center justify-center bg-surface-2">
        <QuickLookContent key={item.id} item={item} />
      </View>
    );
  }
  return (
    <View className="min-h-0 flex-1 flex-row items-center gap-4 bg-surface-2 px-4">
      <Step side="previous" item={place.previous} onGo={onGo} />
      <View className="size-full min-w-0 flex-1 items-center justify-center py-6">
        <QuickLookContent key={item.id} item={item} />
      </View>
      <Step side="next" item={place.next} onGo={onGo} />
    </View>
  );
}

function TouchSteps({
  place,
  onGo,
}: {
  readonly place: QuickLookPlace;
  readonly onGo: (item: DriveItem) => void;
}): ReactNode {
  const position = positionText(place);
  if (position === null) return null;
  return (
    <View className="flex-row items-center justify-between border-t border-outline-variant px-2 py-2 pb-safe">
      <Step side="previous" item={place.previous} onGo={onGo} />
      <Text variant="footnote" tone="variant" className="tabular">
        {position}
      </Text>
      <Step side="next" item={place.next} onGo={onGo} />
    </View>
  );
}

function Panel({
  target,
  item,
  touch,
}: {
  readonly target: QuickLookTarget;
  readonly item: DriveItem;
  readonly touch: boolean;
}): ReactNode {
  const shown = useOverlayShown();
  const place = placeOf(target.items, item);
  usePrefetchNeighbours(place);
  const go = (next: DriveItem): void => {
    target.focus(next);
  };
  const { details } = target;
  return (
    <View
      onLayout={shown}
      className={cn(
        'size-full overflow-hidden',
        touch ? 'bg-chrome pt-safe' : 'rounded-xl bg-surface-raised elevation-3',
      )}
    >
      <QuickLookHeader
        item={item}
        position={touch ? null : positionText(place)}
        touch={touch}
        onDetails={detailsOnInfo(details, item)}
        onClose={target.close}
      />
      <Stage item={item} place={place} touch={touch} onGo={go} />
      {touch ? <TouchSteps place={place} onGo={go} /> : null}
    </View>
  );
}

function keyed(target: QuickLookTarget, item: DriveItem): (key: QuickLookKey) => void {
  return (key) => {
    if (key === 'close') {
      target.close();
      return;
    }
    const next = stepOf(target.items, item, key);
    if (next !== null) target.focus(next);
  };
}

export function QuickLook({ target }: { readonly target: QuickLookTarget }): ReactNode {
  const touch = useSizeClass().sheet === 'bottom';
  const item = target.focused;
  const open = item !== null;
  useQuickLookKeys(open, item === null ? (): void => undefined : keyed(target, item));
  return (
    <Overlay
      open={open}
      onClose={target.close}
      label="Quick look"
      scrim
      className={touch ? '' : 'p-12'}
    >
      {item === null ? null : <Panel target={target} item={item} touch={touch} />}
    </Overlay>
  );
}
