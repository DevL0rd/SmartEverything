import { use } from 'react';
import type { NavPinTarget } from '@smarteverything/domain';
import { ValueStore, useSelected } from '../design/external-store';
import { HeaderPinContext } from './header-pin-context';
import type { MenuItem } from './menu-rows';

export interface HeaderPin {
  readonly target: ValueStore<NavPinTarget | null>;
  readonly items: () => readonly MenuItem[];
}

const NO_PIN: HeaderPin = {
  target: new ValueStore<NavPinTarget | null>(null),
  items: (): readonly MenuItem[] => [],
};

export const HeaderPinProvider = HeaderPinContext.Provider;

export function useHeaderPinItems(): (() => readonly MenuItem[]) | null {
  const pin = use(HeaderPinContext) ?? NO_PIN;
  return useSelected(pin.target, (target) => target !== null) ? pin.items : null;
}
