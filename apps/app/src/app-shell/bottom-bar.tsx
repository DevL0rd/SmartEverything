import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Interactive } from '../components/interactive';
import { cn } from '../design/cn';
import { useToastObstacle } from '../components/toast-obstacles';
import { BarOverlay, useBarOverlay, type BarOverlayControl } from './bar-overlay';
import { BarSlot } from './bar-slot';
import { NO_SLOT, reorderedKeys } from './nav-bar-drag';
import { foldKind, foldableOf, type FoldKind } from './nav-fold';
import { useNavEdits, type NavEdits } from './nav-edit-actions';
import type { NavEntry, NavModel } from './nav-model';
import { NavOrb } from './nav-orb';
import { useNavSheetPan } from './nav-sheet-gesture';
import { openNavSheet } from './nav-sheet-state';
import { useBarDrag, type BarDrag, type SlotRelease } from './use-bar-drag';

export interface NavViewProps {
  readonly model: NavModel;
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
}

function SheetHandle({ active }: { readonly active: boolean }): ReactNode {
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-0 items-center">
      <Interactive
        role="button"
        label="Open navigation"
        hint="Swipe up on the bar to open"
        onPress={openNavSheet}
        selected={active}
        className="h-6 w-32 items-center justify-center"
        layerClassName="rounded-full"
      >
        <View
          className={cn('h-1 rounded-full', active ? 'w-12 bg-primary' : 'w-8 bg-on-surface-faint')}
        />
      </Interactive>
    </View>
  );
}

interface SlotsProps extends NavViewProps {
  readonly drag: BarDrag;
  readonly overlay: BarOverlayControl;
  readonly edits: NavEdits;
  readonly onWidth: (width: number) => void;
}

function foldKindOf(model: NavModel, from: number, into: number): FoldKind {
  const dragged = model.bar[from];
  const target = model.bar[into];
  if (dragged === undefined || target === undefined) return 'refuse';
  return foldKind(foldableOf(dragged, null), foldableOf(target, null));
}

function release(model: NavModel, edits: NavEdits, { slot, to, into }: SlotRelease): void {
  const keys = model.bar.map((node) => node.key);
  const dragged = keys[slot];
  const target = keys[into];
  const kind = foldKindOf(model, slot, into);
  if (into === NO_SLOT || dragged === undefined || target === undefined || kind === 'refuse') {
    edits.move(reorderedKeys(keys, slot, to));
  } else if (kind === 'create') {
    edits.foldInto(dragged, target);
  } else {
    edits.place(dragged, { parent: target, before: null });
  }
}

function BarSlots({ model, go, intent, drag, overlay, edits, onWidth }: SlotsProps): ReactNode {
  const middle = Math.ceil(model.bar.length / 2);
  const slot = (index: number): ReactNode => {
    const node = model.bar[index];
    return node === undefined ? null : (
      <BarSlot
        key={node.key}
        node={node}
        slot={index}
        drag={drag}
        go={go}
        intent={intent}
        onFolder={overlay.show('folder')}
        onHold={overlay.show('menu')}
        onMove={(result: SlotRelease) => {
          release(model, edits, result);
        }}
      />
    );
  };
  const orb = model.orb;
  return (
    <View
      className="flex-row"
      onLayout={(event: LayoutChangeEvent) => {
        onWidth(event.nativeEvent.layout.width);
      }}
    >
      {model.bar.slice(0, middle).map((_node, index) => slot(index))}
      {orb === null ? null : (
        <NavOrb
          entry={orb}
          onPress={() => {
            go(orb);
          }}
          onIntent={() => {
            intent(orb);
          }}
        />
      )}
      {model.bar.slice(middle).map((_node, index) => slot(middle + index))}
    </View>
  );
}

export function BottomBar({ model, go, intent }: NavViewProps): ReactNode {
  const pan = useNavSheetPan('bar');
  const { attach, onLayout } = useToastObstacle('bottom');
  const edits = useNavEdits();
  const overlay = useBarOverlay();
  const [inner, setInner] = useState(0);
  const drag = useBarDrag(
    { count: model.bar.length, orb: model.orb !== null },
    inner,
    (from, into) => foldKindOf(model, from, into),
  );
  return (
    <GestureDetector gesture={pan}>
      <View
        ref={attach}
        onLayout={onLayout}
        accessibilityRole="tablist"
        className="border-t border-outline-variant bg-chrome px-2 pb-safe pt-6"
      >
        <SheetHandle active={model.sheetActive} />
        <BarSlots
          model={model}
          go={go}
          intent={intent}
          drag={drag}
          overlay={overlay}
          edits={edits}
          onWidth={setInner}
        />
        <BarOverlay control={overlay} model={model} edits={edits} go={go} intent={intent} />
      </View>
    </GestureDetector>
  );
}
