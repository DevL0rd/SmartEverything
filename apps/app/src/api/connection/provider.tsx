import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectionState, loadConnection, type ConnectionState } from './connection';
import { useValue } from '../../design/external-store';

function identityOf(state: ConnectionState): string | null {
  return state.status === 'paired' ? `${state.connection.url} ${state.connection.token}` : null;
}

export function ConnectionProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const client = useQueryClient();
  const state = useValue(connectionState);
  const shown = useRef<string | null>(null);
  const identity = identityOf(state);
  useEffect(() => {
    void loadConnection();
  }, []);
  useEffect(() => {
    if (state.status === 'unpaired' || state.status === 'removed') {
      client.clear();
    }
    if (identity !== null && shown.current !== null && shown.current !== identity) {
      client.clear();
    }
    if (identity !== null) {
      shown.current = identity;
    }
  }, [client, identity, state.status]);
  return children;
}

export function useConnection(): ConnectionState {
  return useValue(connectionState);
}
