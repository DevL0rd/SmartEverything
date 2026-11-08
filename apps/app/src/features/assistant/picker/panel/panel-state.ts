import { useState } from 'react';
import type { Engine } from '@smarteverything/domain';
import { WORK_TABS } from '../../provider/work-tabs';

export type PanelPage =
  'main' | 'machine' | 'thinking' | 'image' | 'library' | 'image-library' | 'folder';

export function modelPanelPage(
  operation: string | undefined,
  work: string | undefined,
  engine: Engine['kind'],
): PanelPage | null {
  if (operation === 'model')
    return engine === 'dsh' && WORK_TABS.some((tab) => tab.value === work) ? 'library' : 'main';
  return operation === 'device' && engine === 'dsh' ? 'machine' : null;
}

type LibraryPage = 'library' | 'image-library';

export function isLibraryPage(page: PanelPage): page is LibraryPage {
  return page === 'library' || page === 'image-library';
}

interface PanelNavigation {
  readonly page: PanelPage;
  readonly machineParent: 'main' | 'library';
  readonly returnFocus: Exclude<PanelPage, 'main'> | null;
}

function focusAfter(from: PanelPage, to: PanelPage): PanelNavigation['returnFocus'] {
  if (to === 'main' && from !== 'main') return from;
  if (to === 'library' && from === 'machine') return from;
  return to === 'machine' && from === 'folder' ? 'folder' : null;
}

export function panelParent(initial: PanelPage, state: PanelNavigation): PanelPage | null {
  if (state.page === 'main') return null;
  if (state.page === 'machine') return initial === 'machine' ? null : state.machineParent;
  return state.page === 'folder' ? 'machine' : 'main';
}

export function panelPageChange(current: PanelNavigation, page: PanelPage): PanelNavigation {
  return {
    page,
    machineParent:
      page === 'machine' && current.page !== 'folder'
        ? current.page === 'library'
          ? 'library'
          : 'main'
        : current.machineParent,
    returnFocus: focusAfter(current.page, page),
  };
}

export interface ModelPanelState extends PanelNavigation {
  readonly setPage: (page: PanelPage) => void;
  readonly note: string | null;
  readonly setNote: (note: string | null) => void;
}

export function useModelPanelState(initial: PanelPage): ModelPanelState {
  const [navigation, setNavigation] = useState<PanelNavigation>({
    page: initial,
    machineParent: 'main',
    returnFocus: null,
  });
  const [note, setNote] = useState<string | null>(null);
  return {
    ...navigation,
    setPage: (page): void => {
      setNavigation((current) => panelPageChange(current, page));
    },
    note,
    setNote,
  };
}
