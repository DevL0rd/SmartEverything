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
  type ClaudePrompt,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ComputerAiDirectory } from '../../../computers/ai-directory';
import type { Store } from '../../../store/store';

export function emptyProvider(chat: AiChatRow): AiChatProvider {
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

  read(chat: AiChatRow): AiChatProvider {
    const empty = emptyProvider(chat);
    const saved = this.store.aiProvider.read(chat.id);
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

  bound(chat: AiChatRow): AiChatProvider & { readonly job_id: string } {
    const state = this.read(chat);
    if (state.job_id === null)
      throw new ApiError(
        'conflict',
        'This chat has no retained provider job. Send an explicit new turn to resume its saved session.',
      );
    return { ...state, job_id: state.job_id };
  }

  async metadata(chat: AiChatRow): Promise<AiChatProvider> {
    const state = this.read(chat);
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
    const current = this.read(chat);
    if (current.job_id !== state.job_id || this.metadataRevision.get(chat.id) !== revision)
      throw new ApiError(
        'conflict',
        'The provider job or configuration changed while metadata was being read.',
      );
    this.store.aiProvider.save(chat.id, { ...current, metadata });
    return { ...current, metadata };
  }

  async answer(chat: AiChatRow, promptId: string, answer: ProviderAnswer): Promise<void> {
    const state = this.bound(chat);
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
    const current = this.bound(chat);
    if (current.job_id !== state.job_id)
      throw new ApiError(
        'conflict',
        'The provider job changed before the prompt answer was acknowledged.',
      );
    this.store.aiProvider.save(chat.id, {
      ...current,
      prompts: current.prompts.map((item) =>
        item.id === promptId ? { ...item, status: 'answered' } : item,
      ),
    });
  }

  async control(chat: AiChatRow, control: ProviderControl): Promise<JsonValue> {
    const state = this.bound(chat);
    this.assertSession(chat, 'session_id' in control ? control.session_id : undefined);
    const result = await this.directory.request(
      state.device_id,
      { operation: 'provider_control', job_id: state.job_id, control },
      JSON_VALUE,
    );
    if (control.action === 'fork_session') {
      const fork = z.object({ sessionId: z.string().min(1).max(200) }).parse(result);
      this.store.aiProvider.associate(chat.id, state.device_id, fork.sessionId);
    }
    if (control.action === 'delete_session')
      this.store.aiProvider.forgetSession(chat.id, state.device_id, control.session_id);
    if (changesMetadata(control)) {
      this.metadataRevision.set(chat.id, (this.metadataRevision.get(chat.id) ?? 0) + 1);
      this.readingMetadata.delete(JSON.stringify([chat.id, state.job_id]));
      this.store.aiProvider.save(chat.id, { ...this.read(chat), metadata: null });
    }
    if (
      control.action === 'close' ||
      (control.action === 'delete_session' && control.session_id === state.session_id)
    )
      this.store.aiProvider.save(chat.id, {
        ...this.read(chat),
        job_id: null,
        state: 'idle',
        prompts: [],
        session_id: control.action === 'delete_session' ? null : state.session_id,
      });
    return result;
  }

  assertSession(chat: AiChatRow, sessionId: string | undefined): void {
    const state = this.read(chat);
    if (
      sessionId !== undefined &&
      !this.store.aiProvider.ownsSession(chat.id, state.device_id, sessionId)
    )
      throw new ApiError(
        'forbidden',
        'This native session is not associated with this exact chat and supplying computer.',
      );
  }

  received(chat: AiChatRow, event: ProviderEvent): boolean {
    if (!this.store.aiProvider.append(chat.id, event)) return false;
    if (
      event.kind === 'accepted' ||
      event.kind === 'completed' ||
      event.kind === 'failed' ||
      event.kind === 'prompt' ||
      event.kind === 'dialog'
    ) {
      const state = this.store.aiProvider.read(chat.id, false);
      if (state !== null) this.store.aiProvider.save(chat.id, updatedProvider(state, event));
    }
    return true;
  }
}

function promptOf(event: ProviderEvent): AiChatProvider['prompts'][number] | null {
  if (event.kind === 'dialog')
    return {
      id: event.prompt_id,
      kind: event.dialog_kind,
      request: event.request,
      status: event.status ?? 'pending',
    };
  if (event.kind !== 'prompt') return null;
  return {
    id: event.prompt.id,
    kind: event.prompt.kind,
    request: z.record(z.string(), JSON_VALUE).parse(event.prompt),
    status: nativePromptStatus(event.prompt.state),
  };
}

function nativePromptStatus(
  state: ClaudePrompt['state'],
): AiChatProvider['prompts'][number]['status'] {
  switch (state) {
    case 'waiting':
      return 'pending';
    case 'expired':
    case 'taken_over':
      return 'expired';
    case 'allowed':
    case 'denied':
    case 'answered':
      return 'answered';
  }
}

function changesMetadata(control: ProviderControl): boolean {
  return (
    control.action === 'set_model' ||
    control.action === 'set_permission_mode' ||
    control.action === 'set_mcp_servers' ||
    control.action === 'apply_flags' ||
    control.action === 'update_settings'
  );
}

function updatedProvider(state: AiChatProvider, event: ProviderEvent): AiChatProvider {
  const session =
    event.kind === 'accepted' || event.kind === 'completed' ? event.session_id : state.session_id;
  const terminal = event.kind === 'completed' || event.kind === 'failed';
  const prompts = terminal
    ? state.prompts.map((item) =>
        item.status === 'pending' ? { ...item, status: 'expired' as const } : item,
      )
    : state.prompts;
  const prompt = promptOf(event);
  const base = {
    ...state,
    session_id: session,
    prompts:
      prompt === null ? prompts : [...prompts.filter((item) => item.id !== prompt.id), prompt],
  };
  if (event.kind === 'completed') return { ...base, state: 'completed' };
  if (event.kind === 'failed')
    return { ...base, state: 'failed', job_id: null, reason: event.message };
  return base;
}
