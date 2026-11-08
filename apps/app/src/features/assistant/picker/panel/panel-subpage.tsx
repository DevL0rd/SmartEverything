import { createContext, use, useLayoutEffect } from 'react';
import { EscapeScopeVisible } from '../../../../components/use-escape';

interface PanelSubpage {
  readonly registerBack: (back: () => void) => () => void;
  readonly setTitle: (title: string | null) => void;
}

export const PanelSubpageContext = createContext<PanelSubpage | null>(null);

export function usePanelSubpage(title: string | null, back: (() => void) | null): void {
  const panel = use(PanelSubpageContext);
  const visible = use(EscapeScopeVisible);
  useLayoutEffect(() => {
    if (panel === null || !visible || title === null) return undefined;
    panel.setTitle(title);
    return (): void => {
      panel.setTitle(null);
    };
  }, [panel, visible, title]);
  useLayoutEffect(() => {
    return panel !== null && visible && back !== null ? panel.registerBack(back) : undefined;
  }, [panel, visible, back]);
}
