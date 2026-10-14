import { join } from 'node:path';
import {
  AI_MODEL_CHOICE,
  ENGINE_WRITE,
  ApiError,
  pluginChatKey,
  type AiChatRow,
  type AiModelChoice,
} from '@smarteverything/domain';
import type { AssistantFiles } from '../assistant/files';
import type { AssistantService } from '../assistant/service';
import type { Catalogue } from '../openrouter/catalogue';
import type { Store } from '../store/store';
import type {
  PluginAssistant,
  PluginConversationState,
  PluginFiles,
  PluginUsageSpan,
  PluginUsageView,
} from './builtin/contract';

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

export interface PluginConversationsOptions {
  readonly store: Store;
  readonly assistant: Pick<
    AssistantService,
    'settings' | 'updateChat' | 'interrupt' | 'compact' | 'engineStatus'
  >;
  readonly catalogue: () => Pick<Catalogue, 'resolve'>;
  readonly dataDirectory: string;
  readonly now: () => Date;
}

const PLUGIN_OUTBOX = 'outbox';

export function pluginFiles(
  dataDirectory: string,
  pluginId: string,
  attachmentsOf: PluginFiles['attachmentsOf'],
): PluginFiles {
  const folder = join(dataDirectory, 'plugins', pluginId);
  return { folder, outbox: join(folder, PLUGIN_OUTBOX), attachmentsOf };
}

export function chatAttachmentPaths(
  store: Pick<Store, 'assistantChat'>,
  files: Pick<AssistantFiles, 'pathOf'>,
  chatId: string,
): readonly string[] {
  return store.assistantChat.attachmentsOfChat(chatId).map((file) => files.pathOf(file));
}

export class PluginConversations {
  constructor(private readonly options: PluginConversationsOptions) {}

  forPlugin(pluginId: string): PluginAssistant {
    return {
      settings: () => this.settings(),
      conversation: (key) => this.conversation(pluginId, key),
      usage: () => this.usage(),
      compact: (key) => this.compact(pluginId, key),
      startOver: (key) => this.startOver(pluginId, key),
      stop: (key) => this.stop(pluginId, key),
      setModel: (key, model) => this.setModel(pluginId, key, model),
    };
  }

  private settings(): ReturnType<PluginAssistant['settings']> {
    const settings = this.options.assistant.settings();
    return {
      name: settings.name,
      aliases: settings.aliases,
      activitySteps: settings.activity_steps,
      reuseChatMinutes: settings.reuse_chat_minutes,
      compactAtPercent: settings.compact_at_percent,
    };
  }

  private profileId(): string {
    const owner = this.options.store.clients.owner();
    if (owner === undefined) {
      throw new ApiError('conflict', 'This server has no owner yet.');
    }
    return this.options.store.profiles.activeOf(owner.id).id;
  }

  private chatOf(pluginId: string, key: string): AiChatRow | null {
    return (
      this.options.store.aiChats.bySource(this.profileId(), pluginChatKey(pluginId, key)) ?? null
    );
  }

  private conversation(pluginId: string, key: string): PluginConversationState | null {
    const chat = this.chatOf(pluginId, key);
    if (chat === null) {
      return null;
    }
    const status = this.options.assistant.engineStatus(chat) ?? {
      state: 'unavailable' as const,
      reason: 'No AI is connected to this chat.',
    };
    return {
      title: chat.title,
      state: status.state,
      reason: status.reason,
      model: chat.engine.model,
      costMicros: chat.cost_micros,
    };
  }

  private usage(): PluginUsageView {
    const to = this.options.now();
    const span = (days: number): PluginUsageSpan => {
      const sum = this.options.store.ledger.totals({
        from: new Date(to.getTime() - days * DAY_MS).toISOString(),
        to: to.toISOString(),
      }).sum;
      return { costMicros: sum.cost_micros, calls: sum.count };
    };
    return { today: span(1), week: span(WEEK_DAYS), month: span(MONTH_DAYS) };
  }

  private async compact(pluginId: string, key: string): Promise<boolean> {
    const chat = this.chatOf(pluginId, key);
    if (chat === null) {
      throw new ApiError('not_found', 'There is no conversation to compact yet.');
    }
    return this.options.assistant.compact({ profileId: chat.profile_id, role: 'owner' }, chat.id);
  }

  private async startOver(pluginId: string, key: string): Promise<boolean> {
    const chat = this.chatOf(pluginId, key);
    if (chat === null) {
      return false;
    }
    await this.options.assistant.updateChat(
      { profileId: chat.profile_id, role: 'owner' },
      chat.id,
      { archived: true },
    );
    return true;
  }

  private async stop(pluginId: string, key: string): Promise<boolean> {
    const chat = this.chatOf(pluginId, key);
    if (chat === null || this.options.assistant.engineStatus(chat)?.state !== 'working') {
      return false;
    }
    await this.options.assistant.interrupt({ profileId: chat.profile_id, role: 'owner' }, chat.id);
    return true;
  }

  private async setModel(
    pluginId: string,
    key: string,
    model: string | null,
  ): Promise<string | null> {
    const chat = this.chatOf(pluginId, key);
    if (chat === null) {
      throw new ApiError('not_found', 'Ask something first; the model is set per conversation.');
    }
    if (chat.engine.kind !== 'openrouter') return this.setComputerModel(chat, model);
    const parsed = model === null ? null : AI_MODEL_CHOICE.safeParse(model);
    if (parsed !== null && !parsed.success) {
      throw new ApiError(
        'invalid_request',
        'Give a model id such as google/gemini-3-flash, or default.',
      );
    }
    const choice: AiModelChoice | null = parsed === null ? null : parsed.data;
    const resolved = this.options.catalogue().resolve(choice, null);
    await this.options.assistant.updateChat(
      { profileId: chat.profile_id, role: 'owner' },
      chat.id,
      { engine: { kind: chat.engine.kind, model: choice, effort: chat.engine.effort } },
    );
    return resolved.name;
  }

  private async setComputerModel(chat: AiChatRow, model: string | null): Promise<string> {
    if (model === null)
      throw new ApiError(
        'invalid_request',
        'Choose an explicit model supplied by this subscription computer; its binding cannot be replaced with the OpenRouter default.',
      );
    const engine = ENGINE_WRITE.parse({ ...chat.engine, model });
    await this.options.assistant.updateChat(
      { profileId: chat.profile_id, role: 'owner' },
      chat.id,
      { engine },
    );
    return model;
  }
}
