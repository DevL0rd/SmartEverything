import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Logger } from '@smarteverything/logging';
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
import { ValueStore, useValue } from '../../design/external-store';
import { rawErrorText } from '../../format/errors';
import type { RelayServer } from '../profiles';

const log = new Logger('app.phone');

export type PhoneNodeState =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly status: PhoneNodeStatus }
  | { readonly kind: 'update_needed'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

const node = new ValueStore<PhoneNodeState>(
  phoneNodeLinked ? { kind: 'loading' } : { kind: 'unsupported' },
);

function failed(event: string, error: unknown): void {
  const reason = rawErrorText(error);
  const updateNeeded = error instanceof AppUpdateNeededError;
  log.warn(event, { reason });
  node.set({ kind: updateNeeded ? 'update_needed' : 'failed', reason });
}

export async function changePhoneNode(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
    node.set({ kind: 'ready', status: await phoneNodeStatus() });
  } catch (error) {
    failed('phone.change_failed', error);
  }
}

function reloadPhoneNode(): Promise<void> {
  return changePhoneNode(() => Promise.resolve());
}

const NOTABLE = new Set(['post_failed', 'post_retrying', 'places_error', 'parked_spot_skipped']);

function noted(event: PhoneNativeEvent): void {
  const payload = { detail: event.detail, at: event.at };
  if (NOTABLE.has(event.event)) {
    log.warn(`phone.native_${event.event}`, payload);
  } else {
    log.info(`phone.native_${event.event}`, payload);
  }
  void reloadPhoneNode();
}

export function usePhoneNode(): PhoneNodeState {
  useEffect(() => {
    if (!phoneNodeLinked) {
      return undefined;
    }
    void reloadPhoneNode();
    const events = addPhoneEventListener(noted);
    const back = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reloadPhoneNode();
      }
    });
    return (): void => {
      events.remove();
      back.remove();
    };
  }, []);
  return useValue(node);
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
