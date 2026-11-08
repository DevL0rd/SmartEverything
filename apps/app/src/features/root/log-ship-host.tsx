import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useSegments } from 'expo-router';
import { API_ENDPOINTS as E, type RuntimeLogAck } from '@smarteverything/domain';
import { api, useConnection, type ServerConnection } from '../../api/transport';
import { connectionState } from '../../api/connection/connection';
import { useForeground } from '../../design/animation-gate';
import { useSession, useSyncStatus } from '../../store/selectors';
import { useEntityStore } from '../../store/store-context';
import { bindLogShipping, setLogScreen, type SendLogBatch } from '../../platform/log-ship';
import { markBooted } from '../../platform/crash-guard';

const GROUP = /^\(.*\)$/;

class LogBindingChangedError extends Error {
  override readonly name = 'LogBindingChangedError';

  constructor() {
    super('The paired device or active profile changed before sending runtime logs.');
  }
}

function PairedLogShipHost({ connection }: { readonly connection: ServerConnection }): null {
  const { status } = useSyncStatus();
  const foreground = useForeground();
  const store = useEntityStore();
  const { id: clientId, profile_id: profileId } = useSession().client;
  const hub = connection.trustedMetadata?.identity.id ?? new URL(connection.url).origin;
  const ready = foreground && status === 'live';
  useEffect(() => {
    if (profileId === null) return undefined;
    const current = (): boolean => {
      const liveConnection = connectionState.get();
      const client = store.get().session?.client;
      return (
        liveConnection.status === 'paired' &&
        liveConnection.connection === connection &&
        client?.id === clientId &&
        client.profile_id === profileId
      );
    };
    if (!current()) return undefined;
    const transport = ready ? api() : null;
    const send: SendLogBatch | null =
      transport === null
        ? null
        : (body): Promise<RuntimeLogAck> => {
            if (!current()) return Promise.reject(new LogBindingChangedError());
            return transport.call(E.ingestRuntimeLogs, { body });
          };
    return bindLogShipping({ hub, clientId, profileId }, current, send);
  }, [clientId, connection, hub, profileId, ready, store]);
  return null;
}

export function LogShipHost(): ReactNode {
  const segments = useSegments();
  const screen = segments.filter((segment) => !GROUP.test(segment)).join('/');
  const connection = useConnection();
  useEffect(markBooted, []);
  useEffect(() => {
    setLogScreen(screen);
  }, [screen]);
  return connection.status === 'paired' ? (
    <PairedLogShipHost connection={connection.connection} />
  ) : null;
}
