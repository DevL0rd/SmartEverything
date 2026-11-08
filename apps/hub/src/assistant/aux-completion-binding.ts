import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from '@deepseek-ai/cordis';
import { completeAux, MeteredRouteAdapter } from '@smarteverything/harness/process';
import type { MeteredRouteTransport } from '@smarteverything/harness/process';
import type { SubscriptionAttachmentOptions } from '@smarteverything/harness';
import { ApiError } from '@smarteverything/domain';
import type { AiModelRoute } from '@smarteverything/domain';
import type { HarnessRoutes } from '../harness/routes';
import type { Store } from '../store/store';
import { auxAccountingFetch } from './aux-accounting';
import type { AuxCompletionInput, AuxCompletionPort } from './side-completion';

export class AuxCompletionBinding implements AuxCompletionPort {
  private runtime: AuxCompletionPort | undefined;

  bind(runtime: AuxCompletionPort): () => void {
    this.runtime = runtime;
    return (): void => {
      if (this.runtime === runtime) this.runtime = undefined;
    };
  }

  complete(input: AuxCompletionInput, signal?: AbortSignal): Promise<string> {
    if (this.runtime === undefined)
      return Promise.reject(
        new ApiError('conflict', 'The SmartEverything runtime is starting. Try again in a moment.'),
      );
    return this.runtime.complete(input, signal);
  }
}

const sessionKeys = new AsyncLocalStorage<string>();

const bindings = new WeakMap<Store, AuxCompletionBinding>();

export function auxCompletionsOf(store: Store): AuxCompletionBinding {
  const bound = bindings.get(store);
  if (bound !== undefined) return bound;
  const created = new AuxCompletionBinding();
  bindings.set(store, created);
  return created;
}

export interface AuxCompletionRuntime {
  readonly ctx: Context;
  readonly store: Store;
  readonly routes: Pick<HarnessRoutes, 'list'>;
  readonly key: () => string | null;
  readonly fetch: typeof fetch;
  readonly attachments: SubscriptionAttachmentOptions;
}

interface HeldAdapter {
  readonly revision: string;
  readonly dispose: () => void;
}

function meteredRouteOf(runtime: AuxCompletionRuntime, profileId: string): AiModelRoute {
  const route = runtime.routes
    .list(profileId)
    .find((entry) => entry.auth.provider === 'openrouter' && entry.billing === 'metered');
  if (route?.state !== 'ready')
    throw new ApiError(
      'conflict',
      'Configure the hub OpenRouter supplier before using AI helpers.',
    );
  return route;
}

function transportOf(runtime: AuxCompletionRuntime, route: AiModelRoute): MeteredRouteTransport {
  const { store } = runtime;
  const chatOf = (sessionId: string | undefined): string => {
    if (sessionId === undefined)
      throw new ApiError('forbidden', 'Auxiliary completions require their initiating chat.');
    const chat = store.aiChats.chat(sessionId);
    if (chat.profile_id !== route.profile_id)
      throw new ApiError('forbidden', 'This chat belongs to another person.');
    return chat.id;
  };
  return {
    key: (): Promise<string> => {
      const key = runtime.key();
      if (key === null)
        return Promise.reject(
          new ApiError('conflict', 'The selected supplying account is unavailable.'),
        );
      return Promise.resolve(key);
    },
    authorize: (options): Promise<void> => {
      chatOf(options.sessionId === undefined ? undefined : String(options.sessionId));
      return Promise.resolve();
    },
    fetch: (options) =>
      auxAccountingFetch(
        store,
        {
          chatId: chatOf(options.sessionId === undefined ? undefined : String(options.sessionId)),
          model: options.model,
          sessionKey: sessionKeys.getStore(),
        },
        runtime.fetch,
      ),
  };
}

export function installAuxCompletions(runtime: AuxCompletionRuntime): () => void {
  const held = new Map<string, HeldAdapter>();
  const providerOf = (route: AiModelRoute): string => {
    const provider = `${route.id}:aux`;
    const current = held.get(provider);
    if (current?.revision === route.capability_revision) return provider;
    current?.dispose();
    const adapter = new MeteredRouteAdapter(
      { ...route, id: provider },
      transportOf(runtime, route),
      runtime.attachments,
    );
    held.set(provider, {
      revision: route.capability_revision,
      dispose: runtime.ctx.llm.registerAdapter([provider], adapter),
    });
    return provider;
  };
  const unbind = auxCompletionsOf(runtime.store).bind({
    complete: (input, signal) => {
      const chat = runtime.store.aiChats.chat(input.chatId);
      const provider = providerOf(meteredRouteOf(runtime, chat.profile_id));
      const run = (): Promise<string> =>
        completeAux(
          runtime.ctx,
          {
            provider,
            model: input.model,
            sessionId: chat.id,
            system: input.system,
            input: input.input,
            ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
          },
          signal,
        );
      return input.sessionKey === undefined ? run() : sessionKeys.run(input.sessionKey, run);
    },
  });
  return (): void => {
    unbind();
    for (const adapter of held.values()) adapter.dispose();
    held.clear();
  };
}
