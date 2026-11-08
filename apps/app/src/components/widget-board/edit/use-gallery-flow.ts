import { useState } from 'react';
import type { BoardClass, BoardWidget, WidgetSize } from '@smarteverything/domain';
import type { PickerState, TargetRow } from '../types';
import { entrySize, targetByKey, type GalleryAdd, type GalleryItem } from './gallery-model';

interface Browsing {
  readonly query: string;
  readonly stepId: string | null;
  readonly pickedKey: string | null;
  readonly size: WidgetSize | null;
}

const START: Browsing = { query: '', stepId: null, pickedKey: null, size: null };

export interface GalleryFlow {
  readonly query: string;
  readonly step: GalleryItem | null;
  readonly picked: TargetRow | null;
  readonly size: WidgetSize | null;
  readonly setQuery: (query: string) => void;
  readonly open: (item: GalleryItem) => void;
  readonly pick: (row: TargetRow) => void;
  readonly resize: (size: WidgetSize) => void;
  readonly back: () => void;
  readonly add: (item: GalleryItem, row: TargetRow | null) => void;
  readonly addPicked: () => void;
}

interface GalleryInput {
  readonly board: BoardClass;
  readonly items: readonly GalleryItem[];
  readonly placed: readonly BoardWidget[];
  readonly pickerState: PickerState;
  readonly readPicker: () => PickerState;
  readonly onAdd: (request: GalleryAdd) => void;
}

function currentRequest(
  input: GalleryInput,
  item: GalleryItem,
  key: string | null,
  size: WidgetSize | null,
): GalleryAdd | null {
  if (size === null) return null;
  const type = item.definition.type;
  if (key === null) return item.entry.pick === undefined ? { type, size } : null;
  const row = targetByKey(item, input.readPicker(), input.placed, key);
  return row === null ? null : { type, size, options: row.options };
}

export function useGalleryFlow(input: GalleryInput): GalleryFlow {
  const [browsing, setBrowsing] = useState(START);
  const { board, items, placed, pickerState, onAdd } = input;
  const step = items.find((item) => item.id === browsing.stepId) ?? null;
  const { pickedKey } = browsing;
  const picked =
    step === null || pickedKey === null ? null : targetByKey(step, pickerState, placed, pickedKey);
  if (browsing.stepId !== null && step === null) {
    setBrowsing(START);
  } else if (pickedKey !== null && picked === null) {
    setBrowsing({ ...browsing, pickedKey: null });
  }
  const size = step === null ? null : (browsing.size ?? entrySize(step, board));
  const add = (item: GalleryItem, key: string | null, chosen: WidgetSize | null): void => {
    const request = currentRequest(input, item, key, chosen);
    if (request !== null) {
      setBrowsing(START);
      onAdd(request);
    }
  };
  return {
    query: browsing.query,
    step,
    picked,
    size,
    setQuery: (query): void => {
      setBrowsing((previous) => ({ ...previous, query }));
    },
    open: (item): void => {
      setBrowsing({ ...START, stepId: item.id });
    },
    pick: (row): void => {
      setBrowsing((previous) => ({ ...previous, pickedKey: row.key }));
    },
    resize: (next): void => {
      setBrowsing((previous) => ({ ...previous, size: next }));
    },
    back: (): void => {
      setBrowsing(START);
    },
    add: (item, row): void => {
      add(item, row?.key ?? null, entrySize(item, board));
    },
    addPicked: (): void => {
      if (step !== null && picked !== null) {
        add(step, picked.key, size);
      }
    },
  };
}
