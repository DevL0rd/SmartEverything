import type { ReactNode } from 'react';
import { NavItem } from './nav-item';
import type { NavEntry } from './nav-model';
import { preloader } from './preloader';

export interface NavActions {
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
}

export function navIntent(entry: NavEntry): void {
  preloader.boost(entry.route.href);
}

export function NavItems({
  entries,
  go,
  intent,
  look = 'sidebar',
}: {
  readonly entries: readonly NavEntry[];
  readonly look?: 'sidebar' | 'tile';
} & NavActions): ReactNode {
  return entries.map((entry) => (
    <NavItem
      key={entry.route.key}
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
