import { z } from 'zod';
import {
  BOARD_LAYOUT_VERSION,
  JSON_VALUE,
  readBoardLayout,
  type BoardLayout,
  type JsonValue,
} from '@smarteverything/domain';
import type { BoardLayoutState } from '../components/widget-board';
import type { EntityStore } from './entity-store';
import { saveStoredLayout } from './prefs';
import { useEntityStore, useStoreSelector } from './store-context';

const STORED_LAYOUT = z.record(z.string(), JSON_VALUE);

function layoutBody(layout: BoardLayout): Readonly<Record<string, JsonValue>> {
  const plain: unknown = JSON.parse(JSON.stringify(layout));
  return STORED_LAYOUT.parse(plain);
}

function savePageLayout(store: EntityStore, page: string, layout: BoardLayout): void {
  saveStoredLayout(store, page, layoutBody(layout), 'Your layout was not saved');
}

export function useSavePageLayout(page: string): (layout: BoardLayout) => void {
  const store = useEntityStore();
  return (layout) => {
    savePageLayout(store, page, layout);
  };
}

export function usePageLayout(page: string): BoardLayoutState {
  const store = useEntityStore();
  const loaded = useStoreSelector((state) => state.loaded);
  const stored = useStoreSelector((state) => state.tables.layouts.byId[page]?.layout ?? null);
  if (!loaded) {
    return { status: 'loading' };
  }
  const read = readBoardLayout(stored);
  switch (read.status) {
    case 'absent':
      return { status: 'ready', layout: null };
    case 'stored':
      return { status: 'ready', layout: read.layout };
    case 'invalid':
      return {
        status: 'invalid',
        reason: read.reason,
        reset: (): void => {
          savePageLayout(store, page, { version: BOARD_LAYOUT_VERSION, classes: {} });
        },
      };
  }
}
