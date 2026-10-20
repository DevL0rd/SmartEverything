import { withNativeEnrollment } from './hub-network';
import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { ListeningPowerMode } from '@smarteverything/domain';
import { z } from 'zod';
import { AppUpdateNeededError } from './health-connect';

const LISTENING_NATIVE_STATE = z.strictObject({
  status: z.enum(['off', 'listening', 'resting', 'unavailable']),
  detail: z.string().nullable(),
  transcribe: z.boolean(),
});

export type ListeningNativeState = z.infer<typeof LISTENING_NATIVE_STATE>;

const LISTENING_NATIVE_WAKE = z.strictObject({
  phrase: z.string().min(1),
  snippetDbfs: z.number(),
  preroll: z.string(),
  atMs: z.number(),
});

export type ListeningNativeWake = z.infer<typeof LISTENING_NATIVE_WAKE>;

export interface ListeningNativeConfig {
  readonly wake: boolean;
  readonly transcribe: boolean;
  readonly keywords: string;
  readonly threshold: number;
  readonly pause_ms: number;
  readonly power_mode: ListeningPowerMode;
}

interface ListeningEvents {
  readonly onListeningState: (payload: unknown) => void;
  readonly onListeningWake: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class ListeningNative extends NativeModule<ListeningEvents> {
  configureListening(
    serverUrl: string,
    token: string,
    enrollment: string,
    configJson: string,
  ): Promise<void>;
  restListening(reason: string): Promise<void>;
  resumeListening(): Promise<void>;
  stopListening(): Promise<void>;
  releaseWake(): Promise<void>;
  watchListeningLevel(on: boolean): Promise<void>;
}

type ListeningName =
  Exclude<keyof ListeningNative, keyof NativeModule<ListeningEvents>> | 'addListener';

const listening = requireOptionalNativeModule<ListeningNative>('Listening');

function listeningFor(operation: ListeningName): ListeningNative {
  if (listening === null || typeof Reflect.get(listening, operation) !== 'function') {
    throw new AppUpdateNeededError(`listening (${operation})`);
  }
  return listening;
}

export function listeningLinked(): boolean {
  return listening !== null;
}

export async function configureListening(
  serverUrl: string,
  token: string,
  config: ListeningNativeConfig,
): Promise<void> {
  const source = listeningFor('configureListening');
  await withNativeEnrollment(serverUrl, token, (enrollment) =>
    source.configureListening(serverUrl, token, enrollment, JSON.stringify(config)),
  );
}

export async function restListening(reason: string): Promise<void> {
  await listeningFor('restListening').restListening(reason);
}

export async function resumeListening(): Promise<void> {
  await listeningFor('resumeListening').resumeListening();
}

export async function stopListening(): Promise<void> {
  await listeningFor('stopListening').stopListening();
}

export async function releaseWake(): Promise<void> {
  await listeningFor('releaseWake').releaseWake();
}

export async function watchListeningLevel(on: boolean): Promise<void> {
  await listeningFor('watchListeningLevel').watchListeningLevel(on);
}

export function addListeningListeners(listeners: {
  readonly state: (state: ListeningNativeState) => void;
  readonly wake: (wake: ListeningNativeWake) => void;
}): { readonly remove: () => void } {
  const module = listeningFor('addListener');
  const state = module.addListener('onListeningState', (payload) => {
    listeners.state(LISTENING_NATIVE_STATE.parse(payload));
  });
  const wake = module.addListener('onListeningWake', (payload) => {
    listeners.wake(LISTENING_NATIVE_WAKE.parse(payload));
  });
  return {
    remove: (): void => {
      state.remove();
      wake.remove();
    },
  };
}
