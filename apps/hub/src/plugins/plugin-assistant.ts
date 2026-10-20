import { join } from 'node:path';
import { ownerProfileOf } from '../transcripts/owner';
import {
  AI_MODEL_CHOICE,
  ENGINE_WRITE,
  ApiError,
  turnRoleOf,
  type PluginRequester,
  type AiChatRow,
  type AiModelChoice,
} from '@smarteverything/domain';
import type { AssistantFiles } from '../assistant/files';
import type { AssistantService } from '../assistant/service';
import type { Catalogue } from '../openrouter/catalogue';
import type { Store } from '../store/store';
import { admittedIdentityOf, identityChatKey } from './plugin-identity';
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
  fromMachine: PluginFiles['fromMachine'],
  fromUpload: PluginFiles['fromUpload'],
): PluginFiles {
  const folder = join(dataDirectory, 'plugins', pluginId);
  return { folder, outbox: join(folder, PLUGIN_OUTBOX), attachmentsOf, fromMachine, fromUpload };
}

export function chatAttachmentPaths(
  store: Pick<Store, 'assistantChat'>,
  files: Pick<AssistantFiles, 'pathOf'>,
  chatId: string,
): readonly string[] {
  return store.assistantChat.attachmentsOfChat(chatId).map((file) => files.pathOf(file));
}

interface Asker {
  readonly profileId: string;
  readonly role: 'owner' | 'member';
  readonly requester: PluginRequester | null;
  readonly guest: string | null;
}

function refuseStranger(asker: Asker, what: string): void {
  if (asker.requester === 'unlisted') {
    throw new ApiError('forbidden', `Only people linked to a person of the home can ${what}.`);
  }
}

export class PluginConversations {
  constructor(private readonly options: PluginConversationsOptions) {}

  forPlugin(pluginId: string): PluginAssistant {
    return {
      settings: () => this.settings(),
      conversation: (key, actor) => this.conversation(this.asker(pluginId, actor), pluginId, key),
      usage: (actor) => this.usage(this.asker(pluginId, actor)),
      compact: (key, actor) =>
        Promise.resolve().then(() => this.compact(this.asker(pluginId, actor), pluginId, key)),
      startOver: (key, actor) =>
        Promise.resolve().then(() => this.startOver(this.asker(pluginId, actor), pluginId, key)),
      stop: (key, actor) =>
        Promise.resolve().then(() => this.stop(this.asker(pluginId, actor), pluginId, key)),
      setModel: (key, model, actor) =>
        Promise.resolve().then(() =>
          this.setModel(this.asker(pluginId, actor), pluginId, key, model),
        ),
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

  private asker(pluginId: string, actor: string | undefined): Asker {
    if (actor === undefined) {
      return {
        profileId: ownerProfileOf(this.options.store),
        role: 'owner',
        requester: null,
        guest: null,
      };
    }
    const { requester, profileId, guest } = admittedIdentityOf(this.options.store, pluginId, actor);
    return { profileId, role: turnRoleOf(requester), requester, guest };
  }

  private chatOf(asker: Asker, pluginId: string, key: string): AiChatRow | null {
    return (
      this.options.store.aiChats.bySource(
        asker.profileId,
        identityChatKey(asker.guest, pluginId, key),
      ) ?? null
    );
  }

  private conversation(
    asker: Asker,
    pluginId: string,
    key: string,
  ): PluginConversationState | null {
    const chat = this.chatOf(asker, pluginId, key);
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

  private usage(asker: Asker): PluginUsageView {
    refuseStranger(asker, 'see what the AI cost');
    const to = this.options.now();
    const span = (days: number): PluginUsageSpan => {
      const sum = this.options.store.ledger.totals({
        from: new Date(to.getTime() - days * DAY_MS).toISOString(),
        to: to.toISOString(),
        ...(asker.role === 'owner' ? {} : { profileIds: [asker.profileId] }),
      }).sum;
      return { costMicros: sum.cost_micros, calls: sum.count };
    };
    return { today: span(1), week: span(WEEK_DAYS), month: span(MONTH_DAYS) };
  }

  private async compact(asker: Asker, pluginId: string, key: string): Promise<boolean> {
    refuseStranger(asker, 'compact a conversation');
    const chat = this.chatOf(asker, pluginId, key);
    if (chat === null) {
      throw new ApiError('not_found', 'There is no conversation to compact yet.');
    }
    return this.options.assistant.compact(
      { profileId: chat.profile_id, role: asker.role },
      chat.id,
    );
  }

  private async startOver(asker: Asker, pluginId: string, key: string): Promise<boolean> {
    refuseStranger(asker, 'start a conversation over');
    const chat = this.chatOf(asker, pluginId, key);
    if (chat === null) {
      return false;
    }
    await this.options.assistant.updateChat(
      { profileId: chat.profile_id, role: asker.role },
      chat.id,
      { archived: true },
    );
    return true;
  }

  private async stop(asker: Asker, pluginId: string, key: string): Promise<boolean> {
    refuseStranger(asker, 'stop a conversation');
    const chat = this.chatOf(asker, pluginId, key);
    if (chat === null || this.options.assistant.engineStatus(chat)?.state !== 'working') {
      return false;
    }
    await this.options.assistant.interrupt(
      { profileId: chat.profile_id, role: asker.role },
      chat.id,
    );
    return true;
  }

  private async setModel(
    asker: Asker,
    pluginId: string,
    key: string,
    model: string | null,
  ): Promise<string | null> {
    refuseStranger(asker, 'change the model');
    const chat = this.chatOf(asker, pluginId, key);
    if (chat === null) {
      throw new ApiError('not_found', 'Ask something first; the model is set per conversation.');
    }
    if (chat.engine.kind !== 'dsh') return this.setComputerModel(asker, chat, model);
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
      { profileId: chat.profile_id, role: asker.role },
      chat.id,
      { engine: { kind: 'openrouter', model: choice, effort: chat.engine.effort } },
    );
    return resolved.name;
  }

  private async setComputerModel(
    asker: Asker,
    chat: AiChatRow,
    model: string | null,
  ): Promise<string> {
    if (model === null)
      throw new ApiError(
        'invalid_request',
        'A computer chat has no default model. Give the model id to use.',
      );
    const engine = ENGINE_WRITE.parse({ ...chat.engine, model });
    await this.options.assistant.updateChat(
      { profileId: chat.profile_id, role: asker.role },
      chat.id,
      { engine },
    );
    return model;
  }
}
