import type { ReactNode } from 'react';
import { FilterChip } from '../../../components/filter-chip';
import { ChipRow } from '../../../components/chip-row';
import type { FileBrowserHandle } from './browser-types';

export function kindChipsShown<O>(browser: FileBrowserHandle<O>): boolean {
  const { abilities, listing, state, filter } = browser;
  if (!abilities.kindFilter || listing.entries.length === 0) return false;
  return filter.kinds.length > 2 || state.filter.kind !== 'all';
}

export function KindChips<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  if (!kindChipsShown(browser)) return null;
  const { state, filter } = browser;
  const chips = filter.kinds;
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
