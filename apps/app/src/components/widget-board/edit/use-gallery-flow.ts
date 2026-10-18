import { useState } from 'react';
import type { BoardClass, WidgetSize } from '@smarteverything/domain';
import type { TargetRow } from '../types';
import { entrySize, type GalleryAdd, type GalleryItem, type TargetOption } from './gallery-model';

interface Browsing {
  readonly query: string;
  readonly step: GalleryItem | null;
  readonly picked: TargetOption | null;
  readonly size: WidgetSize | null;
}

const START: Browsing = { query: '', step: null, picked: null, size: null };

export interface GalleryFlow {
  readonly query: string;
  readonly step: GalleryItem | null;
  readonly picked: TargetOption | null;
  readonly size: WidgetSize | null;
  readonly setQuery: (query: string) => void;
  readonly open: (item: GalleryItem) => void;
  readonly pick: (row: TargetOption) => void;
  readonly resize: (size: WidgetSize) => void;
  readonly back: () => void;
  readonly add: (item: GalleryItem, row: TargetRow | null) => void;
  readonly addPicked: () => void;
  readonly close: () => void;
}

function requestOf(item: GalleryItem, row: TargetRow | null, size: WidgetSize): GalleryAdd {
  return row === null
    ? { type: item.definition.type, size }
    : { type: item.definition.type, size, options: row.options };
}

export function useGalleryFlow(
  board: BoardClass,
  onAdd: (request: GalleryAdd) => void,
  onClose: () => void,
): GalleryFlow {
  const [browsing, setBrowsing] = useState(START);
  const { step, picked } = browsing;
  const size = step === null ? null : (browsing.size ?? entrySize(step, board));
  const add = (item: GalleryItem, row: TargetRow | null): void => {
    const chosen = entrySize(item, board);
    if (chosen !== null) {
      setBrowsing(START);
      onAdd(requestOf(item, row, chosen));
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
      setBrowsing({ ...START, step: item });
    },
    pick: (row): void => {
      setBrowsing((previous) => ({ ...previous, picked: row }));
    },
    resize: (next): void => {
      setBrowsing((previous) => ({ ...previous, size: next }));
    },
    back: (): void => {
      setBrowsing(START);
    },
    add,
    addPicked: (): void => {
      if (step !== null && picked !== null && size !== null) {
        setBrowsing(START);
        onAdd(requestOf(step, picked, size));
      }
    },
    close: (): void => {
      setBrowsing(START);
      onClose();
    },
  };
}
