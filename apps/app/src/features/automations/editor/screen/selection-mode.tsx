import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import type { DocumentStore } from '../../model/editor/document-store';
import { selectIds } from '../host/edit-intents';
import { selectedText } from './screen-model';

export function accumulateTap(
  previous: readonly string[],
  next: readonly string[],
): readonly string[] | null {
  const [tapped] = next;
  if (next.length !== 1 || tapped === undefined || previous.length === 0) return null;
  return previous.includes(tapped) ? previous.filter((id) => id !== tapped) : [...previous, tapped];
}

export interface SelectionMode {
  readonly selecting: boolean;
  readonly toggle: () => void;
  readonly end: () => void;
}

export function useSelectionMode(store: DocumentStore): SelectionMode {
  const [selecting, setSelecting] = useState(false);
  const last = useRef<readonly string[]>(store.state.get().selection.ids);
  useEffect(() => {
    last.current = store.state.get().selection.ids;
    let applying = false;
    return store.state.subscribe(() => {
      if (applying) return;
      const next = store.state.get().selection.ids;
      const merged = selecting ? accumulateTap(last.current, next) : null;
      if (merged === null) {
        last.current = next;
        return;
      }
      applying = true;
      last.current = merged;
      selectIds(store, merged);
      applying = false;
    });
  }, [store, selecting]);
  return {
    selecting,
    toggle: (): void => {
      setSelecting((current) => !current);
    },
    end: (): void => {
      setSelecting(false);
    },
  };
}

export function SelectionPill({
  count,
  onClear,
}: {
  readonly count: number;
  readonly onClear: () => void;
}): ReactNode {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Selection"
      accessibilityLiveRegion="polite"
      className="absolute inset-x-0 top-3 items-center"
      pointerEvents="box-none"
    >
      <View className="flex-row items-center gap-2 rounded-full border border-outline-variant bg-surface-raised py-1 pl-4 pr-1 elevation-2">
        <Text variant="label">{selectedText(count)}</Text>
        <Button label="Clear" variant="text" disabled={count === 0} onPress={onClear} />
      </View>
    </View>
  );
}
