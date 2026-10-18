import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { PermissionsAndroid, type Permission } from 'react-native';
import { Logger } from '@smarteverything/logging';
import {
  isHealthConnectLinked,
  openDndAccess,
  openNotificationAccess,
  phoneApps,
  setWatchRelay,
  watchRelayStatus,
  type PhoneApp,
  type WatchRelayChange,
  type WatchRelayStatus,
} from '../../../modules/health-connect';
import { notify } from '../../components/toast-store';
import { rawErrorText } from '../../format/errors';
import { useScreenQuery } from '../../queries/use-screen-query';

const log = new Logger('app.watch');

export const RELAY_KEY = ['native', 'watch-relay'] as const;
const APPS_KEY = ['native', 'phone-apps'] as const;

export type RelayState =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly status: WatchRelayStatus }
  | { readonly kind: 'failed'; readonly reason: string };

export function relayStateOf(
  linked: boolean,
  status: WatchRelayStatus | undefined,
  error: Error | null,
): RelayState {
  if (!linked) {
    return { kind: 'unsupported' };
  }
  if (status !== undefined) {
    return { kind: 'ready', status };
  }
  return error === null ? { kind: 'loading' } : { kind: 'failed', reason: rawErrorText(error) };
}

export function useRelay(): RelayState {
  const query = useScreenQuery({
    queryKey: RELAY_KEY,
    queryFn: watchRelayStatus,
    enabled: isHealthConnectLinked,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return relayStateOf(isHealthConnectLinked, query.data, query.error);
}

export function usePhoneApps(): {
  readonly apps: readonly PhoneApp[];
  readonly error: Error | null;
} {
  const query = useScreenQuery({
    queryKey: APPS_KEY,
    queryFn: phoneApps,
    enabled: isHealthConnectLinked,
    retry: false,
  });
  return { apps: query.data ?? [], error: query.error };
}

interface RelayRequest {
  readonly change: WatchRelayChange;
  readonly askCallPermissions: boolean;
}

function callPermissions(): Permission[] {
  const { PERMISSIONS } = PermissionsAndroid;
  return [
    PERMISSIONS.READ_PHONE_STATE,
    PERMISSIONS.READ_CALL_LOG,
    PERMISSIONS.READ_CONTACTS,
    PERMISSIONS.ANSWER_PHONE_CALLS,
  ];
}

async function changeRelay({
  change,
  askCallPermissions,
}: RelayRequest): Promise<WatchRelayStatus> {
  if (askCallPermissions) {
    const answers = await PermissionsAndroid.requestMultiple(callPermissions());
    log.info('watch.call_permissions_answered', answers);
  }
  const status = await setWatchRelay(change);
  log.info('watch.relay_changed', { ...change, apps: change.apps?.length ?? null });
  return status;
}

export function relayChangeOptions(client: QueryClient): {
  readonly mutationFn: (request: RelayRequest) => Promise<WatchRelayStatus>;
  readonly onSuccess: (status: WatchRelayStatus) => void;
  readonly onError: (error: Error) => void;
} {
  return {
    mutationFn: changeRelay,
    onSuccess: (status): void => {
      client.setQueryData(RELAY_KEY, status);
    },
    onError: (error): void => {
      log.error('watch.relay_change_failed', error);
      notify({ message: 'The watch setting was not changed', error, tone: 'critical' });
    },
  };
}

export function useRelayChange(): {
  readonly change: (change: WatchRelayChange) => void;
  readonly allowCalls: (on: boolean) => void;
} {
  const client = useQueryClient();
  const mutation = useMutation(relayChangeOptions(client));
  return {
    change: (change): void => {
      mutation.mutate({ change, askCallPermissions: false });
    },
    allowCalls: (on): void => {
      mutation.mutate({ change: { calls: on }, askCallPermissions: on });
    },
  };
}

export async function openAccess(which: 'notifications' | 'dnd'): Promise<void> {
  log.info('watch.access_opened', { which });
  await (which === 'notifications' ? openNotificationAccess() : openDndAccess());
}
