import type { ReactNode } from 'react';
import { useConnection } from '../api/transport';
import { HomeStore } from '../store/home-store';
import { LoadedGate } from './shell-gate';

export function HomeHost({ children }: { readonly children: ReactNode }): ReactNode {
  const state = useConnection();
  if (state.status === 'loading') {
    return null;
  }
  if (state.status !== 'paired') {
    return children;
  }
  return (
    <HomeStore key={state.connection.token} connection={state.connection}>
      <LoadedGate>{children}</LoadedGate>
    </HomeStore>
  );
}
