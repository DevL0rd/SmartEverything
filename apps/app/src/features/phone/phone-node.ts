import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Logger, background } from '@smarteverything/logging';
import {
  AppUpdateNeededError,
  addPhoneEventListener,
  phoneNodeLinked,
  phoneNodeStatus,
  startPhoneNode,
  stopPhoneNode,
  type PhoneNativeEvent,
  type PhoneNodeStatus,
} from '../../../modules/health-connect';
import { notify } from '../../components/toast-store';
import { ValueStore } from '../../design/external-store';
import { rawErrorText } from '../../format/errors';
import { useScreenQuery } from '../../queries/use-screen-query';
import type { RelayServer } from '../profiles';

const log = new Logger('app.phone');

const PHONE_NODE_KEY = ['native', 'phone-node'] as const;

export type PhoneNodeState =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly status: PhoneNodeStatus }
  | { readonly kind: 'update_needed'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

export function phoneNodeStateOf(
  linked: boolean,
  status: PhoneNodeStatus | undefined,
  error: Error | null,
): PhoneNodeState {
  if (!linked) {
    return { kind: 'unsupported' };
  }
  if (status !== undefined) {
    return { kind: 'ready', status };
  }
  if (error === null) {
    return { kind: 'loading' };
  }
  const reason = rawErrorText(error);
  return error instanceof AppUpdateNeededError
    ? { kind: 'update_needed', reason }
    : { kind: 'failed', reason };
}

const changes = new ValueStore(0);

export async function changePhoneNode(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    log.warn('phone.change_failed', { reason: rawErrorText(error) });
    notify({ message: 'The phone setting was not changed', error, tone: 'critical' });
  } finally {
    changes.update((count) => count + 1);
  }
}

const NOTABLE = new Set(['post_failed', 'post_retrying', 'places_error', 'parked_spot_skipped']);

function noted(event: PhoneNativeEvent): void {
  const payload = { detail: event.detail, at: event.at };
  if (NOTABLE.has(event.event)) {
    log.warn(`phone.native_${event.event}`, payload);
  } else {
    log.info(`phone.native_${event.event}`, payload);
  }
}

export function usePhoneNode(): PhoneNodeState {
  const client = useQueryClient();
  const query = useScreenQuery({
    queryKey: PHONE_NODE_KEY,
    queryFn: phoneNodeStatus,
    enabled: phoneNodeLinked,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });
  useEffect(() => {
    if (!phoneNodeLinked) {
      return undefined;
    }
    const refresh = (): void => {
      background(
        client.invalidateQueries({ queryKey: PHONE_NODE_KEY }),
        'queries.invalidate_failed',
      );
    };
    const events = addPhoneEventListener((event) => {
      noted(event);
      refresh();
    });
    const off = changes.subscribe(refresh);
    return (): void => {
      events.remove();
      off();
    };
  }, [client]);
  return phoneNodeStateOf(phoneNodeLinked, query.data, query.error);
}

export async function setPhoneNodeOn(on: boolean, server: RelayServer | null): Promise<void> {
  log.info('phone.node_changed', { on });
  await changePhoneNode(async () => {
    if (!on) {
      await stopPhoneNode();
      return;
    }
    if (server === null) {
      throw new PhoneNotPairedError();
    }
    await startPhoneNode(server.url, server.token);
  });
}

class PhoneNotPairedError extends Error {
  override readonly name = 'PhoneNotPairedError';

  constructor() {
    super('Pair this phone with your home first.');
  }
}
