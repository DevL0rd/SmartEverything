import type { PanelPage } from './panel-state';

export type PanelEscape = 'back' | 'clear' | 'close';

export function panelEscapeOf(page: PanelPage, text: string): PanelEscape {
  if (page !== 'main') return 'back';
  return text === '' ? 'close' : 'clear';
}
