import { z } from 'zod';
import {
  ApiError,
  PROVIDER_ANSWER,
  PROVIDER_CONTROL,
  PROVIDER_EVENT,
  CODEX_PROVIDER_EVENT,
  JSON_VALUE,
  NATIVE_MANAGED_PROJECT,
  PROVIDER_METADATA,
  CODEX_PROVIDER_CONTROL,
  CODEX_ANSWER,
  type AiChatRow,
  type AiChatRuntimeProvider,
  type ComputerAiRuntime,
  type ProviderAnswer,
  type ProviderControl,
  type ProviderEvent,
  type CodexProviderEvent,
  type JsonValue,
  type ProviderMetadata,
} from '@smarteverything/domain';
import type { ComputerAiDirectory } from '../../../computers/ai-directory';
import type { Store } from '../../../store/store';
import { ProviderState as ClaudeState } from '../claude/provider-state';
import { runtimeValue } from './request';
import { metadataSubscriptionUsage } from '../../native-subscription';

export type ComputerEvent = ProviderEvent | CodexProviderEvent;
export type ComputerControl = ProviderControl | z.infer<typeof CODEX_PROVIDER_CONTROL>;
export type ComputerAnswer = ProviderAnswer | z.infer<typeof CODEX_ANSWER>;

export class ProviderState {
  private readonly claude: ClaudeState;
  constructor(
    private readonly store: Store,
    private readonly directory: ComputerAiDirectory,
    readonly runtime: ComputerAiRuntime,
  ) {
    this.claude = new ClaudeState(store, directory);
  }
  async read(chat: AiChatRow): Promise<AiChatRuntimeProvider> {
    if (chat.engine.kind !== this.runtime)
      throw new ApiError('invalid_request', 'This chat has a different runtime binding.');
    if (this.runtime === 'claude') {
      const claude = await this.claude.read(chat);
      const retained = await this.store.host.call('aiRuntimeProvider', 'read', chat.id, false);
      return {
        ...claude,
        runtime: 'claude',
        context: retained?.context ?? null,
        ...(retained?.managed_project === undefined
          ? {}
          : { managed_project: retained.managed_project }),
      };
    }
    const saved = await this.store.host.call('aiRuntimeProvider', 'read', chat.id);
    if (saved?.runtime === 'codex' && saved.device_id === chat.engine.device_id) return saved;
    return {
      runtime: 'codex',
      device_id: chat.engine.device_id,
      session_id: null,
      job_id: null,
      state: 'idle',
      reason: null,
      metadata: null,
      prompts: [],
      events: [],
      context: null,
    };
  }
  save(chat: AiChatRow, state: AiChatRuntimeProvider): Promise<void> {
    return this.store.host.call('aiRuntimeProvider', 'save', chat.id, state);
  }
  async bound(chat: AiChatRow): Promise<AiChatRuntimeProvider & { readonly job_id: string }> {
    const state = await this.read(chat);
    if (state.job_id === null)
      throw new ApiError(
        'conflict',
        'Send an explicit turn to resume this saved provider session.',
      );
    return { ...state, job_id: state.job_id };
  }
  async metadata(chat: AiChatRow): Promise<AiChatRuntimeProvider> {
    if (this.runtime === 'claude') {
      const provider = await this.claude.metadata(chat);
      return { ...provider, runtime: 'claude', context: (await this.read(chat)).context };
    }
    const state = await this.read(chat);
    const target = { device_id: state.device_id, runtime: this.runtime };
    const status = this.directory.runtimeStatus(target);
    if (
      state.metadata !== null ||
      !status.online ||
      !status.capabilities.operations.includes('provider_metadata')
    )
      return state;
    const metadata = await runtimeValue(
      this.directory,
      target,
      {
        runtime: 'codex',
        request: {
          operation: 'provider_metadata',
          ...(state.job_id === null ? {} : { job_id: state.job_id }),
        },
      },
      PROVIDER_METADATA,
    );
    return this.savedMetadata(chat, state, metadata);
  }
  private async savedMetadata(
    chat: AiChatRow,
    state: AiChatRuntimeProvider,
    metadata: ProviderMetadata,
  ): Promise<AiChatRuntimeProvider> {
    const current = await this.read(chat);
    if (current.job_id !== state.job_id || current.device_id !== state.device_id)
      throw new ApiError('conflict', 'The provider binding changed during metadata discovery.');
    const usage = metadataSubscriptionUsage(metadata);
    const updated = {
      ...current,
      metadata,
      ...(usage?.runtime === 'codex' ? { subscription_usage: usage } : {}),
    };
    await this.store.host.write('computerProviderMetadataSave', {
      chat,
      state: updated,
      usage: usage ?? null,
    });
    return updated;
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
        this.runtime,
      ))
    )
      throw new ApiError(
        'forbidden',
        'This session does not belong to this chat, computer and runtime.',
      );
  }
  async answer(chat: AiChatRow, promptId: string, answer: ComputerAnswer): Promise<void> {
    if (this.runtime === 'claude')
      return this.claude.answer(chat, promptId, PROVIDER_ANSWER.parse(answer));
    const state = await this.bound(chat);
    if (
      state.runtime !== 'codex' ||
      !state.prompts.some((prompt) => prompt.id === promptId && prompt.status === 'pending')
    )
      throw new ApiError('conflict', 'This exact prompt is no longer pending.');
    const result = await runtimeValue(
      this.directory,
      { device_id: state.device_id, runtime: 'codex' },
      {
        runtime: 'codex',
        request: {
          operation: 'provider_answer',
          job_id: state.job_id,
          prompt_id: promptId,
          answer: CODEX_ANSWER.parse(answer),
        },
      },
      z.object({ answered: z.boolean() }),
    );
    if (!result.answered)
      throw new ApiError('conflict', 'The provider rejected this stale prompt.');
    const current = await this.bound(chat);
    if (current.runtime !== 'codex' || current.job_id !== state.job_id)
      throw new ApiError('conflict', 'The provider job changed before acknowledgement.');
    await this.save(chat, {
      ...current,
      prompts: current.prompts.map((prompt) =>
        prompt.id === promptId ? { ...prompt, status: 'answered' } : prompt,
      ),
    });
  }
  async control(chat: AiChatRow, control: ComputerControl): Promise<JsonValue> {
    if (this.runtime === 'claude')
      return this.claude.control(chat, PROVIDER_CONTROL.parse(control));
    const state = await this.bound(chat);
    const parsed = CODEX_PROVIDER_CONTROL.parse(control);
    await this.assertSession(chat, 'session_id' in parsed ? parsed.session_id : undefined);
    const result = await runtimeValue(
      this.directory,
      { device_id: state.device_id, runtime: 'codex' },
      {
        runtime: 'codex',
        request: { operation: 'provider_control', job_id: state.job_id, control: parsed },
      },
      JSON_VALUE,
    );
    if (parsed.action === 'fork_session') {
      const fork = z.object({ session_id: z.string().min(1) }).parse(result);
      await this.store.host.call(
        'aiProvider',
        'associate',
        chat.id,
        state.device_id,
        fork.session_id,
        'codex',
      );
    }
    if (parsed.action === 'delete_session')
      await this.store.host.call(
        'aiProvider',
        'forgetSession',
        chat.id,
        state.device_id,
        parsed.session_id,
        'codex',
      );
    if (
      parsed.action === 'close' ||
      (parsed.action === 'delete_session' && parsed.session_id === state.session_id)
    )
      await this.save(chat, {
        ...(await this.read(chat)),
        job_id: null,
        state: 'idle',
        prompts: [],
      });
    return result;
  }
  async received(chat: AiChatRow, event: ComputerEvent): Promise<boolean> {
    if (this.runtime === 'claude') {
      const accepted = await this.claude.received(chat, PROVIDER_EVENT.parse(event));
      if (accepted) await this.captureClaudeContext(chat, event);
      return accepted;
    }
    return this.store.host.write('codexProviderReceive', {
      chatId: chat.id,
      event: CODEX_PROVIDER_EVENT.parse(event),
    });
  }
  private async captureClaudeContext(chat: AiChatRow, event: ComputerEvent): Promise<void> {
    if (event.kind !== 'runtime') return;
    const source = z
      .object({
        session_id: z.string(),
        _source_generation: z.uuid(),
        _source_cwd: z.string(),
        managed_project: NATIVE_MANAGED_PROJECT.optional(),
      })
      .safeParse(event.payload);
    if (!source.success) return;
    const state = await this.read(chat);
    if (state.runtime !== 'claude') return;
    await this.save(chat, {
      ...state,
      context: {
        device_id: state.device_id,
        runtime: 'claude',
        session_id: source.data.session_id,
        process_generation: source.data._source_generation,
        cwd: source.data._source_cwd,
        ...(source.data.managed_project === undefined
          ? {}
          : { managed_project: source.data.managed_project }),
      },
    });
  }
}
