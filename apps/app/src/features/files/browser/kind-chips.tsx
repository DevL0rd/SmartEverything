import type { ReactNode } from 'react';
import { FilterChip } from '../../../components/filter-chip';
import { ChipRow } from '../../../components/library-frame';
import type { FileBrowserHandle } from './browser-types';

export function KindChips<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const { abilities, listing, state, filter } = browser;
  if (!abilities.kindFilter || listing.entries.length === 0) return null;
  const chips = filter.kinds;
  if (chips.length <= 2 && state.filter.kind === 'all') return null;
  return (
    <ChipRow label={filter.active ? 'Kinds in the results' : 'Kinds in this folder'}>
      {chips.map((chip) => (
        <FilterChip
          key={chip.kind}
          label="Kind"
          value={chip.label}
          {...(chip.count === null ? {} : { count: chip.count })}
          active={chip.kind === state.filter.kind}
          singleChoice
          onPress={() => {
            browser.dispatch({ kind: 'filter', change: { kind: chip.kind } });
          }}
        />
      ))}
    </ChipRow>
  );
}
