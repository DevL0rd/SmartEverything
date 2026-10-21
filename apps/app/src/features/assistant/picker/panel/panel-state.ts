import { useState } from 'react';

export type PanelPage = 'main' | 'machine' | 'thinking';

export interface ModelPanelState {
  readonly page: PanelPage;
  readonly setPage: (page: PanelPage) => void;
  readonly note: string | null;
  readonly setNote: (note: string | null) => void;
}

export function useModelPanelState(initial: PanelPage): ModelPanelState {
  const [page, setPage] = useState<PanelPage>(initial);
  const [note, setNote] = useState<string | null>(null);
  return { page, setPage, note, setNote };
}
