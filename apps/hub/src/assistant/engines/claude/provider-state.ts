import {
  ApiError,
  JSON_VALUE,
  PROVIDER_METADATA,
  type AiChatProvider,
  type AiChatRow,
  type JsonValue,
  type ProviderAnswer,
  type ProviderControl,
  type ProviderEvent,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ComputerAiDirectory } from '../../../computers/ai-directory';
import type { Store } from '../../../store/store';
import { metadataSubscriptionUsage } from '../../native-subscription';
import { changesMetadata } from './provider-update';

function emptyProvider(chat: AiChatRow): AiChatProvider {
  if (chat.engine.kind !== 'claude')
    throw new ApiError('invalid_request', 'This chat uses a different engine.');
  return {
    device_id: chat.engine.device_id,
    session_id: null,
    job_id: null,
    state: 'idle',
    reason: null,
    metadata: null,
    prompts: [],
    events: [],
  };
}

export class ProviderState {
  private readonly readingMetadata = new Map<string, Promise<AiChatProvider>>();
  private readonly metadataRevision = new Map<string, number>();
  constructor(
    private readonly store: Store,
    private readonly directory: ComputerAiDirectory,
  ) {}

  async read(chat: AiChatRow): Promise<AiChatProvider> {
    const empty = emptyProvider(chat);
    const saved = await this.store.host.call('aiProvider', 'read', chat.id);
    if (saved?.device_id !== empty.device_id) return empty;
    const status = this.directory.status(saved.device_id);
    return !status.online
      ? {
          ...saved,
          reason:
            'The supplying computer is offline; previous work is never automatically resubmitted.',
        }
      : saved;
  }

  async bound(chat: AiChatRow): Promise<AiChatProvider & { readonly job_id: string }> {
    const state = await this.read(chat);
    if (state.job_id === null)
      throw new ApiError(
        'conflict',
        'This chat has no retained provider job. Send an explicit new turn to resume its saved session.',
      );
    return { ...state, job_id: state.job_id };
  }

  async metadata(chat: AiChatRow): Promise<AiChatProvider> {
    const state = await this.read(chat);
    if (state.metadata !== null) return state;
    const status = this.directory.status(state.device_id);
    if (
      !status.online ||
      !status.settings.provider.enabled ||
      !status.capabilities.operations.includes('provider_metadata')
    )
      return state;
    const key = JSON.stringify([chat.id, state.job_id]);
    const reading = this.readingMetadata.get(key);
    if (reading !== undefined) return reading;
    const result = this.loadMetadata(chat, state, this.metadataRevision.get(chat.id));
    this.readingMetadata.set(key, result);
    try {
      return await result;
    } finally {
      if (this.readingMetadata.get(key) === result) this.readingMetadata.delete(key);
    }
  }

  private async loadMetadata(
    chat: AiChatRow,
    state: AiChatProvider,
    revision: number | undefined,
  ): Promise<AiChatProvider> {
    const metadata = await this.directory.request(
      state.device_id,
      {
        operation: 'provider_metadata',
        ...(state.job_id === null ? {} : { job_id: state.job_id }),
      },
      PROVIDER_METADATA,
    );
    const current = await this.read(chat);
    if (current.job_id !== state.job_id || this.metadataRevision.get(chat.id) !== revision)
      throw new ApiError(
        'conflict',
        'The provider job or configuration changed while metadata was being read.',
      );
    const usage = metadataSubscriptionUsage(metadata);
    const updated = {
      ...current,
      metadata,
      ...(usage?.runtime === 'claude' ? { subscription_usage: usage } : {}),
    };
    await this.store.host.write('claudeProviderMetadataSave', {
      chat,
      state: updated,
      usage: usage ?? null,
    });
    return updated;
  }

  async answer(chat: AiChatRow, promptId: string, answer: ProviderAnswer): Promise<void> {
    const state = await this.bound(chat);
    const prompt = state.prompts.find((item) => item.id === promptId && item.status === 'pending');
    if (prompt === undefined)
      throw new ApiError('conflict', 'This exact prompt is no longer pending in this chat.');
    const reply = await this.directory.request(
      state.device_id,
      { operation: 'provider_answer', job_id: state.job_id, prompt_id: promptId, answer },
      z.strictObject({ answered: z.boolean() }),
    );
    if (!reply.answered)
      throw new ApiError(
        'conflict',
        'The provider no longer recognizes this exact pending prompt.',
      );
    const current = await this.bound(chat);
    if (current.job_id !== state.job_id)
      throw new ApiError(
        'conflict',
        'The provider job changed before the prompt answer was acknowledged.',
      );
    await this.store.host.call('aiProvider', 'save', chat.id, {
      ...current,
      prompts: current.prompts.map((item) =>
        item.id === promptId ? { ...item, status: 'answered' as const } : item,
      ),
    });
  }

  async control(chat: AiChatRow, control: ProviderControl): Promise<JsonValue> {
    const state = await this.bound(chat);
    await this.assertSession(chat, 'session_id' in control ? control.session_id : undefined);
    const result = await this.directory.request(
      state.device_id,
      { operation: 'provider_control', job_id: state.job_id, control },
      JSON_VALUE,
    );
    if (control.action === 'fork_session') {
      const fork = z.object({ sessionId: z.string().min(1).max(200) }).parse(result);
      await this.store.host.call(
        'aiProvider',
        'associate',
        chat.id,
        state.device_id,
        fork.sessionId,
      );
    }
    if (control.action === 'delete_session')
      await this.store.host.call(
        'aiProvider',
        'forgetSession',
        chat.id,
        state.device_id,
        control.session_id,
      );
    if (changesMetadata(control)) {
      this.metadataRevision.set(chat.id, (this.metadataRevision.get(chat.id) ?? 0) + 1);
      this.readingMetadata.delete(JSON.stringify([chat.id, state.job_id]));
      await this.store.host.call('aiProvider', 'save', chat.id, {
        ...(await this.read(chat)),
        metadata: null,
      });
    }
    if (
      control.action === 'close' ||
      (control.action === 'delete_session' && control.session_id === state.session_id)
    )
      await this.store.host.call('aiProvider', 'save', chat.id, {
        ...(await this.read(chat)),
        job_id: null,
        state: 'idle',
        prompts: [],
        session_id: control.action === 'delete_session' ? null : state.session_id,
      });
    return result;
  }

  async assertSession(chat: AiChatRow, sessionId: string | undefined): Promise<void> {
    const state = await this.read(chat);
    if (
      sessionId !== undefined &&
      !(await this.store.host.call(
        'aiProvider',
        'ownsSession',
        chat.id,
        state.device_id,
        sessionId,
      ))
    )
      throw new ApiError(
        'forbidden',
        'This native session is not associated with this exact chat and supplying computer.',
      );
  }

  received(chat: AiChatRow, event: ProviderEvent): Promise<boolean> {
    return this.store.host.write('claudeProviderReceive', { chatId: chat.id, event });
  }
}
