import type { ReactNode } from 'react';
import { useConnection } from '../api/transport';
import { DeveloperSyncHost } from '../developer/sync-host';
import { WidgetModelsProvider } from '../features/device-visuals';
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
    <HomeStore
      key={`${state.connection.url}:${state.connection.token}`}
      connection={state.connection}
    >
      <DeveloperSyncHost />
      <LoadedGate>
        <WidgetModelsProvider>{children}</WidgetModelsProvider>
      </LoadedGate>
    </HomeStore>
  );
}
