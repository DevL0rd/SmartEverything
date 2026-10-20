import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NavPinTarget } from '@smarteverything/domain';
import { HeaderPinProvider, type HeaderPin } from '../components/header-pin';
import type { MenuItem } from '../components/menu';
import { ValueStore } from '../design/external-store';
import { useStableCallback } from '../design/use-stable-callback';
import { useNavPins } from './nav-layout';
import { pinMenuItem, usePagePinTarget } from './pin-menu';

function PagePinTracker({ target }: { readonly target: ValueStore<NavPinTarget | null> }): null {
  const current = usePagePinTarget();
  useEffect(() => {
    target.set(current);
  }, [target, current]);
  return null;
}

export function PagePinHost({ children }: { readonly children: ReactNode }): ReactNode {
  const pins = useNavPins();
  const [target] = useState(() => new ValueStore<NavPinTarget | null>(null));
  const items = useStableCallback((): readonly MenuItem[] => {
    const current = target.get();
    return current === null ? [] : [pinMenuItem(current, 'page', pins.isPinned(current), pins)];
  });
  const pin = useMemo((): HeaderPin => ({ target, items }), [target, items]);
  return (
    <HeaderPinProvider value={pin}>
      <PagePinTracker target={target} />
      {children}
    </HeaderPinProvider>
  );
}
