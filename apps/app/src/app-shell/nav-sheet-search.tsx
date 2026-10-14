import type { ReactElement, ReactNode, RefObject } from 'react';
import { useImperativeHandle } from 'react';
import { ResultList } from '../search/result-list';
import { useSettledSearchPanel } from '../search/search-panel';
import type { ListDismiss } from './nav-sheet-gesture';
import { closeNavSheet, navSheetQuery } from './nav-sheet-state';

export interface NavSheetSearchHandle {
  readonly submit: (() => void) | null;
}

interface NavSheetSearchProps {
  readonly query: string;
  readonly settled: string;
  readonly onScroll: ListDismiss['onScroll'];
  readonly spacer: ReactElement;
  readonly ref: RefObject<NavSheetSearchHandle | null>;
}

export function NavSheetSearch({
  query,
  settled,
  onScroll,
  spacer,
  ref,
}: NavSheetSearchProps): ReactNode {
  const panel = useSettledSearchPanel(
    {
      query,
      onQuery: navSheetQuery.set,
      look: 'page',
      onDone: closeNavSheet,
      onEscape: closeNavSheet,
    },
    settled,
  );
  useImperativeHandle(ref, () => ({ submit: panel.submit }), [panel.submit]);
  return (
    <ResultList
      model={panel.model}
      onScroll={onScroll}
      contentClassName="px-4 pb-safe-offset-6"
      footer={spacer}
    />
  );
}
