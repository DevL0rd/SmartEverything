import type { ReactNode } from 'react';
import { useConnection } from '../api/transport';
import { HomeStore } from '../store/home-store';

export function HomeHost({ children }: { readonly children: ReactNode }): ReactNode {
  const state = useConnection();
  if (state.status !== 'paired') {
    return children;
  }
  return (
    <HomeStore key={state.connection.token} connection={state.connection}>
      {children}
    </HomeStore>
  );
}
