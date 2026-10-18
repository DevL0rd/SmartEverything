import { API_ENDPOINTS as E, type AssistantStatus } from '@smarteverything/domain';
import type { QueryClient } from '@tanstack/react-query';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../api/transport';
import { connectionState } from '../api/connection/connection';
import { ValueStore, useValue } from '../design/external-store';
import type { EntityStore } from './entity-store';
import { noticeHandler } from './notice-registry';
const log = new Logger('app.assistant');
const availability = new ValueStore<string | null>(null);

const RESPONSE_STYLE_KEY = ['assistant', 'response-style'] as const;

export function useResponseStyleProblem(): string | null {
  return useValue(availability);
}

function mergeResponseStyle(
  status: AssistantStatus,
  current: AssistantStatus | null,
): AssistantStatus {
  const style = current?.settings.response_style;
  return style === undefined
    ? status
    : { ...status, settings: { ...status.settings, response_style: style } };
}

export async function refreshResponseStyle(client: QueryClient, store: EntityStore): Promise<void> {
  if (connectionState.get().status !== 'paired') return;
  const hub = api();
  const profileId = store.get().session?.client.profile_id;
  const current = (): boolean =>
    connectionState.get().status === 'paired' &&
    api() === hub &&
    store.get().session?.client.profile_id === profileId;
  try {
    const style = await client.query({
      queryKey: [...RESPONSE_STYLE_KEY, hub.baseUrl, profileId ?? null],
      queryFn: () => hub.call(E.readAssistantResponseStyle, {}),
      staleTime: 0,
    });
    if (!current()) return;
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
    const message = `Response style could not load: ${String(error)}`;
    availability.set(message);
    log.warn('response_style.read_failed', { reason: message });
    store.update((state) => {
      if (state.assistant === null) return state;
      const { response_style: _style, ...settings } = state.assistant.settings;
      return { ...state, assistant: { ...state.assistant, settings } };
    });
  }
}

export const ASSISTANT_STATUS_NOTICE = noticeHandler(
  ['assistant_status'],
  (message, { client, store }) => {
    store.update((state) => ({
      ...state,
      assistant: mergeResponseStyle(message.status, state.assistant),
    }));
    background(refreshResponseStyle(client, store), 'response_style.refresh_failed');
  },
);

export interface AssistantWriteScope {
  readonly client: ReturnType<typeof api>;
  readonly current: () => boolean;
}
class StaleAssistantWriteError extends Error {
  override readonly name = 'StaleAssistantWriteError';
  constructor() {
    super('Your home or profile changed, so nothing was saved. Check the settings and save again.');
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
