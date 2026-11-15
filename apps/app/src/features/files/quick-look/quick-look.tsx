import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Logger } from '@smarteverything/logging';
import { IconButton } from '../../../components/icon-button';
import { Overlay, useOverlayShown } from '../../../components/overlay';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import { useScopeVisible } from '../../../design/visibility';
import type { FileNode, FileSource } from '../source/types';
import { exportStateOf } from './export-model';
import { QuickLookContent } from './quick-look-content';
import { QuickLookHeader } from './quick-look-header';
import { useQuickLookKeys } from './quick-look-keys';
import {
  contentFactsOf,
  contentOf,
  detailsOnInfo,
  placeOf,
  positionText,
  stepOf,
  type QuickLookKey,
  type QuickLookPlace,
  type QuickLookTarget,
} from './quick-look-model';

const log = new Logger('app.files');

function Prefetch<O>({
  node,
  source,
}: {
  readonly node: FileNode<O>;
  readonly source: FileSource<O>;
}): ReactNode {
  const { thumb } = source.useLinks(node);
  useEffect(() => {
    if (thumb === null) return;
    Image.prefetch(thumb, 'disk').catch((error: unknown) => {
      log.warn('quick_look.prefetch_failed', { reason: String(error) });
    });
  }, [thumb]);
  return null;
}

function Neighbours<O>({
  place,
  source,
}: {
  readonly place: QuickLookPlace<FileNode<O>>;
  readonly source: FileSource<O>;
}): ReactNode {
  if (!useScopeVisible()) return null;
  return (
    <>
      {place.previous === null ? null : <Prefetch node={place.previous} source={source} />}
      {place.next === null ? null : <Prefetch node={place.next} source={source} />}
    </>
  );
}

function Step<O>({
  side,
  node,
  onGo,
}: {
  readonly side: 'previous' | 'next';
  readonly node: FileNode<O> | null;
  readonly onGo: (node: FileNode<O>) => void;
}): ReactNode {
  return (
    <IconButton
      icon={side === 'previous' ? 'chevronLeft' : 'chevronRight'}
      label={side === 'previous' ? 'Previous file' : 'Next file'}
      variant="raised"
      disabled={node === null}
      shortcut={side === 'previous' ? '←' : '→'}
      onPress={() => {
        if (node !== null) onGo(node);
      }}
    />
  );
}

function TouchSteps<O>({
  place,
  onGo,
}: {
  readonly place: QuickLookPlace<FileNode<O>>;
  readonly onGo: (node: FileNode<O>) => void;
}): ReactNode {
  const position = positionText(place);
  if (position === null) return null;
  return (
    <View className="flex-row items-center justify-between border-t border-outline-variant px-2 py-2 pb-safe">
      <Step side="previous" node={place.previous} onGo={onGo} />
      <Text variant="footnote" tone="variant" className="tabular">
        {position}
      </Text>
      <Step side="next" node={place.next} onGo={onGo} />
    </View>
  );
}

function Stage<O>({
  target,
  place,
  touch,
  children,
}: {
  readonly target: QuickLookTarget<O>;
  readonly place: QuickLookPlace<FileNode<O>>;
  readonly touch: boolean;
  readonly children: ReactNode;
}): ReactNode {
  if (touch) {
    return (
      <>
        <View className="min-h-0 flex-1 items-center justify-center bg-surface-2">{children}</View>
        <TouchSteps place={place} onGo={target.focus} />
      </>
    );
  }
  return (
    <View className="min-h-0 flex-1 flex-row items-center gap-4 bg-surface-2 px-4">
      <Step side="previous" node={place.previous} onGo={target.focus} />
      <View className="size-full min-w-0 flex-1 items-center justify-center py-6">{children}</View>
      <Step side="next" node={place.next} onGo={target.focus} />
    </View>
  );
}

function Panel<O>({
  target,
  node,
  touch,
}: {
  readonly target: QuickLookTarget<O>;
  readonly node: FileNode<O>;
  readonly touch: boolean;
}): ReactNode {
  const shown = useOverlayShown();
  const { source, abilities } = target;
  const links = source.useLinks(node);
  const place = placeOf(target.nodes, node);
  const exports = exportStateOf(node, abilities);
  return (
    <View
      onLayout={shown}
      className={cn(
        'size-full overflow-hidden',
        touch ? 'bg-chrome pt-safe' : 'rounded-xl bg-surface-raised elevation-3',
      )}
    >
      <Neighbours place={place} source={source} />
      <QuickLookHeader
        node={node}
        links={links}
        exports={exports}
        position={touch ? null : positionText(place)}
        touch={touch}
        onDetails={detailsOnInfo(target.details, node)}
        onClose={target.close}
      />
      <Stage target={target} place={place} touch={touch}>
        <QuickLookContent
          key={node.key}
          node={node}
          links={links}
          exports={exports}
          content={contentOf(node, contentFactsOf(abilities, links.thumb))}
          source={source}
        />
      </Stage>
    </View>
  );
}

function keyed<O>(target: QuickLookTarget<O>, node: FileNode<O>): (key: QuickLookKey) => void {
  return (key) => {
    if (key === 'close') {
      target.close();
      return;
    }
    const next = stepOf(target.nodes, node, key);
    if (next !== null) target.focus(next);
  };
}

export function QuickLook<O>({ target }: { readonly target: QuickLookTarget<O> }): ReactNode {
  const touch = useSizeClass().sheet === 'bottom';
  const node = target.focused;
  const open = node !== null;
  useQuickLookKeys(open, node === null ? (): void => undefined : keyed(target, node));
  return (
    <Overlay
      open={open}
      onClose={target.close}
      label="Quick look"
      scrim
      className={touch ? '' : 'p-12'}
    >
      {node === null ? null : <Panel target={target} node={node} touch={touch} />}
    </Overlay>
  );
}
