import type { ReactNode } from 'react';
import { use } from 'react';
import { HomeDataContext, useHomeData } from '../data/home-data';

const NOTHING_SPOTLIGHTED: ReadonlySet<string> = new Set();

function OwnHomeData({ children }: { readonly children: ReactNode }): ReactNode {
  const data = useHomeData();
  return (
    <HomeDataContext value={{ ...data, spotlighted: NOTHING_SPOTLIGHTED }}>
      {children}
    </HomeDataContext>
  );
}

export function HomeScope({ children }: { readonly children: ReactNode }): ReactNode {
  return use(HomeDataContext) === null ? <OwnHomeData>{children}</OwnHomeData> : children;
}
