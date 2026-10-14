import { API_ENDPOINTS as E, ApiError, type AssistantStatus } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../api/transport';
import { connectionState } from '../api/connection/connection';
import { ValueStore, useValue } from '../design/external-store';
import type { EntityStore } from './entity-store';
const log = new Logger('app.assistant');
const availability = new ValueStore<string | null>(null);
const supported = new WeakSet<ReturnType<typeof api>>();
interface StyleRead {
  readonly client: ReturnType<typeof api>;
  readonly profileId: string | null | undefined;
  readonly promise: Promise<void>;
  dirty: boolean;
}
const requests = new WeakMap<EntityStore, StyleRead>();
const revisions = new WeakMap<EntityStore, number>();
export function useResponseStyleProblem(): string | null {
  return useValue(availability);
}
export function responseStyleSupported(): boolean {
  return connectionState.get().status === 'paired' && supported.has(api());
}
export function mergeResponseStyle(
  status: AssistantStatus,
  current: AssistantStatus | null,
): AssistantStatus {
  const style = current?.settings.response_style;
  return style === undefined
    ? status
    : { ...status, settings: { ...status.settings, response_style: style } };
}
export function refreshResponseStyle(store: EntityStore): Promise<void> {
  if (connectionState.get().status !== 'paired') return Promise.resolve();
  const client = api();
  const profileId = store.get().session?.client.profile_id;
  const pending = requests.get(store);
  if (pending?.client === client && pending.profileId === profileId) {
    pending.dirty = true;
    return pending.promise;
  }
  const revision = (revisions.get(store) ?? 0) + 1;
  revisions.set(store, revision);
  const request: StyleRead = {
    client,
    profileId,
    dirty: false,
    promise: readStyle(store, { client, profileId, revision }),
  };
  requests.set(store, request);
  return request.promise.finally(() => {
    if (requests.get(store) !== request) return;
    requests.delete(store);
    if (request.dirty) void refreshResponseStyle(store);
  });
}
async function readStyle(
  store: EntityStore,
  scope: {
    readonly client: ReturnType<typeof api>;
    readonly profileId: string | null | undefined;
    readonly revision: number;
  },
): Promise<void> {
  const { client, profileId, revision } = scope;
  const current = (): boolean =>
    revisions.get(store) === revision &&
    connectionState.get().status === 'paired' &&
    api() === client &&
    store.get().session?.client.profile_id === profileId;
  try {
    const style = await client.call(E.readAssistantResponseStyle, {});
    if (!current()) return;
    supported.add(client);
    availability.set(null);
    store.update((state) =>
      state.assistant === null
        ? state
        : {
            ...state,
            assistant: {
              ...state.assistant,
              settings: { ...state.assistant.settings, response_style: style },
            },
          },
    );
  } catch (error) {
    if (!current()) return;
    supported.delete(client);
    const message =
      error instanceof ApiError && error.code === 'not_found'
        ? 'Update the hub to configure response style.'
        : `Response style could not load: ${String(error)}`;
    availability.set(message);
    log.warn('response_style.read_failed', { reason: message });
    store.update((state) => {
      if (state.assistant === null) return state;
      const { response_style: _style, ...settings } = state.assistant.settings;
      return { ...state, assistant: { ...state.assistant, settings } };
    });
  }
}

export interface AssistantWriteScope {
  readonly client: ReturnType<typeof api>;
  readonly current: () => boolean;
}
export class StaleAssistantWriteError extends Error {
  override readonly name = 'StaleAssistantWriteError';
  constructor() {
    super(
      'The selected server or profile changed. The original request was not applied to this view. Review its settings before submitting again.',
    );
  }
}
export function captureAssistantWrite(store: EntityStore): AssistantWriteScope {
  const client = api();
  const connection = connectionState.get();
  const session = store.get().session;
  const profileId = session?.client.profile_id;
  return {
    client,
    current: (): boolean =>
      connectionState.get() === connection &&
      api() === client &&
      store.get().session === session &&
      store.get().session?.client.profile_id === profileId,
  };
}
export function assertAssistantWriteCurrent(scope: AssistantWriteScope): void {
  if (!scope.current()) throw new StaleAssistantWriteError();
}
