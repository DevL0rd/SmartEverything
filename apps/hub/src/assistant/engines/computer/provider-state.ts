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
} from '@smarteverything/domain';
import type { ComputerAiDirectory } from '../../../computers/ai-directory';
import type { Store } from '../../../store/store';
import { ProviderState as ClaudeState } from '../claude/provider-state';
import { runtimeValue } from './request';
import { codexUsage } from './subscription-usage';
import { updatedCodexProvider } from '../codex/provider-state';

export type ComputerEvent = ProviderEvent | CodexProviderEvent;
export type ComputerControl = ProviderControl | z.infer<typeof CODEX_PROVIDER_CONTROL>;
export type ComputerAnswer = ProviderAnswer | z.infer<typeof CODEX_ANSWER>;

export class ProviderState {
  private readonly claude: ClaudeState;
  constructor(
    private readonly store: Store,
    private readonly directory: ComputerAiDirectory,
    readonly runtime: ComputerAiRuntime,
    private readonly now: () => Date,
  ) {
    this.claude = new ClaudeState(store, directory);
  }
  read(chat: AiChatRow): AiChatRuntimeProvider {
    if (chat.engine.kind !== this.runtime)
      throw new ApiError('invalid_request', 'This chat has a different runtime binding.');
    if (this.runtime === 'claude')
      return {
        ...this.claude.read(chat),
        runtime: 'claude',
        context: this.store.aiRuntimeProvider.read(chat.id, false)?.context ?? null,
      };
    const saved = this.store.aiRuntimeProvider.read(chat.id);
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
  save(chat: AiChatRow, state: AiChatRuntimeProvider): void {
    this.store.aiRuntimeProvider.save(chat.id, state);
  }
  bound(chat: AiChatRow): AiChatRuntimeProvider & { readonly job_id: string } {
    const state = this.read(chat);
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
      return { ...provider, runtime: 'claude', context: this.read(chat).context };
    }
    const state = this.read(chat);
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
    const current = this.read(chat);
    if (current.job_id !== state.job_id || current.device_id !== state.device_id)
      throw new ApiError('conflict', 'The provider binding changed during metadata discovery.');
    const updated = {
      ...current,
      metadata,
      subscription_usage: codexUsage(
        metadata.initialization['rate_limits'],
        this.now().toISOString(),
      ),
    };
    this.save(chat, updated);
    return updated;
  }
  assertSession(chat: AiChatRow, sessionId: string | undefined): void {
    const state = this.read(chat);
    if (
      sessionId !== undefined &&
      !this.store.aiProvider.ownsSession(chat.id, state.device_id, sessionId, this.runtime)
    )
      throw new ApiError(
        'forbidden',
        'This session does not belong to this chat, computer and runtime.',
      );
  }
  async answer(chat: AiChatRow, promptId: string, answer: ComputerAnswer): Promise<void> {
    if (this.runtime === 'claude')
      return this.claude.answer(chat, promptId, PROVIDER_ANSWER.parse(answer));
    const state = this.bound(chat);
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
    const current = this.bound(chat);
    if (current.runtime !== 'codex' || current.job_id !== state.job_id)
      throw new ApiError('conflict', 'The provider job changed before acknowledgement.');
    this.save(chat, {
      ...current,
      prompts: current.prompts.map((prompt) =>
        prompt.id === promptId ? { ...prompt, status: 'answered' } : prompt,
      ),
    });
  }
  async control(chat: AiChatRow, control: ComputerControl): Promise<JsonValue> {
    if (this.runtime === 'claude')
      return this.claude.control(chat, PROVIDER_CONTROL.parse(control));
    const state = this.bound(chat);
    const parsed = CODEX_PROVIDER_CONTROL.parse(control);
    this.assertSession(chat, 'session_id' in parsed ? parsed.session_id : undefined);
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
      this.store.aiProvider.associate(chat.id, state.device_id, fork.session_id, 'codex');
    }
    if (parsed.action === 'delete_session')
      this.store.aiProvider.forgetSession(chat.id, state.device_id, parsed.session_id, 'codex');
    if (
      parsed.action === 'close' ||
      (parsed.action === 'delete_session' && parsed.session_id === state.session_id)
    )
      this.save(chat, { ...this.read(chat), job_id: null, state: 'idle', prompts: [] });
    return result;
  }
  received(chat: AiChatRow, event: ComputerEvent): boolean {
    if (this.runtime === 'claude') {
      const accepted = this.claude.received(chat, PROVIDER_EVENT.parse(event));
      if (accepted) this.captureClaudeContext(chat, event);
      return accepted;
    }
    const parsed = CODEX_PROVIDER_EVENT.parse(event);
    if (!this.store.aiRuntimeProvider.append(chat.id, { runtime: 'codex', event: parsed }))
      return false;
    const state = this.store.aiRuntimeProvider.read(chat.id, false);
    if (state?.runtime === 'codex') this.save(chat, updatedCodexProvider(state, parsed));
    return true;
  }
  private captureClaudeContext(chat: AiChatRow, event: ComputerEvent): void {
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
    const state = this.read(chat);
    if (state.runtime !== 'claude') return;
    this.store.aiRuntimeProvider.save(chat.id, {
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
