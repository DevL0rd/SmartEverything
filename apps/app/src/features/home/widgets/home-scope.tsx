import type { ReactNode } from 'react';
import { use } from 'react';
import { HomeDataContext, useHomeData, useHomeViewStore } from '../data/home-data';

const NOTHING_SPOTLIGHTED: ReadonlySet<string> = new Set();

function OwnHomeData({ children }: { readonly children: ReactNode }): ReactNode {
  const data = useHomeData();
  const store = useHomeViewStore({ ...data, spotlighted: NOTHING_SPOTLIGHTED });
  return <HomeDataContext value={store}>{children}</HomeDataContext>;
}

export function HomeScope({ children }: { readonly children: ReactNode }): ReactNode {
  return use(HomeDataContext) === null ? <OwnHomeData>{children}</OwnHomeData> : children;
}
