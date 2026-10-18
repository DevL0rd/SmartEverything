import { useState } from 'react';

export type PanelPage = 'main' | 'machine' | 'thinking';

export interface ScrollMemory {
  readonly offset: () => number;
  readonly remember: (offset: number) => void;
}

function createScrollMemory(): ScrollMemory {
  let saved = 0;
  return {
    offset: (): number => saved,
    remember: (offset): void => {
      saved = offset;
    },
  };
}

export interface ModelPanelState {
  readonly page: PanelPage;
  readonly setPage: (page: PanelPage) => void;
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly note: string | null;
  readonly setNote: (note: string | null) => void;
  readonly scroll: ScrollMemory;
}

export function useModelPanelState(initial: PanelPage): ModelPanelState {
  const [page, setPage] = useState<PanelPage>(initial);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [scroll] = useState(createScrollMemory);
  return {
    page,
    setPage,
    text,
    setText: (next): void => {
      scroll.remember(0);
      setText(next);
    },
    note,
    setNote,
    scroll,
  };
}
