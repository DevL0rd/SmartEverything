import type { ReactNode } from 'react';
import { NavItem } from './nav-item';
import type { NavEntry } from './nav-model';
import { preloader } from './preloader';

export interface NavActions {
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
}

export function navIntent(entry: NavEntry): void {
  if (entry.href !== null) preloader.boost(entry.href);
}

export function NavItems({
  entries,
  go,
  intent,
  look = 'sidebar',
}: {
  readonly entries: readonly NavEntry[];
  readonly look?: 'sidebar';
} & NavActions): ReactNode {
  return entries.map((entry) => (
    <NavItem
      key={entry.key}
      entry={entry}
      look={look}
      onPress={() => {
        go(entry);
      }}
      onIntent={() => {
        intent(entry);
      }}
    />
  ));
}
