import { join } from 'node:path';
import {
  AI_MODEL_CHOICE,
  DSH_ENGINE_REQUEST,
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
  readonly now: () => Date;
}

const PLUGIN_OUTBOX = 'outbox';

export function pluginFiles(
  folder: string,
  readers: Omit<PluginFiles, 'folder' | 'outbox'>,
): PluginFiles {
  return { folder, outbox: join(folder, PLUGIN_OUTBOX), ...readers };
}

export async function chatAttachmentPaths(
  store: Pick<Store, 'host'>,
  files: Pick<AssistantFiles, 'pathOf'>,
  chatId: string,
): Promise<readonly string[]> {
  return (await store.host.call('assistantChat', 'attachmentsOfChat', chatId)).map((file) =>
    files.pathOf(file),
  );
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
      conversation: async (key, actor) =>
        this.conversation(await this.asker(pluginId, actor), pluginId, key),
      usage: async (actor) => this.usage(await this.asker(pluginId, actor)),
      compact: async (key, actor) => this.compact(await this.asker(pluginId, actor), pluginId, key),
      startOver: async (key, actor) =>
        this.startOver(await this.asker(pluginId, actor), pluginId, key),
      stop: async (key, actor) => this.stop(await this.asker(pluginId, actor), pluginId, key),
      setModel: async (key, model, actor) =>
        this.setModel(await this.asker(pluginId, actor), pluginId, key, model),
    };
  }

  private settings(): ReturnType<PluginAssistant['settings']> {
    const settings = this.options.assistant.settings();
    return {
      name: settings.name,
      aliases: settings.aliases,
      activitySteps: settings.activity_steps,
      compactAtPercent: settings.compact_at_percent,
    };
  }

  private async asker(pluginId: string, actor: string | undefined): Promise<Asker> {
    if (actor === undefined) {
      return {
        profileId: await this.options.store.host.call('personAccess', 'homeOwner'),
        role: 'owner',
        requester: null,
        guest: null,
      };
    }
    const { requester, profileId, guest } = await admittedIdentityOf(
      this.options.store,
      pluginId,
      actor,
    );
    return { profileId, role: turnRoleOf(requester), requester, guest };
  }

  private async chatOf(asker: Asker, pluginId: string, key: string): Promise<AiChatRow | null> {
    return (
      (await this.options.store.host.call(
        'aiChats',
        'bySource',
        asker.profileId,
        identityChatKey(asker.guest, pluginId, key),
      )) ?? null
    );
  }

  private async conversation(
    asker: Asker,
    pluginId: string,
    key: string,
  ): Promise<PluginConversationState | null> {
    const chat = await this.chatOf(asker, pluginId, key);
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

  private async usage(asker: Asker): Promise<PluginUsageView> {
    refuseStranger(asker, 'see what the AI cost');
    const to = this.options.now();
    const span = async (days: number): Promise<PluginUsageSpan> => {
      const { sum } = await this.options.store.host.read('mcpUsageTotals', {
        from: new Date(to.getTime() - days * DAY_MS).toISOString(),
        to: to.toISOString(),
        ...(asker.role === 'owner' ? {} : { profileIds: [asker.profileId] }),
      });
      return { costMicros: sum.cost_micros, calls: sum.count };
    };
    const [today, week, month] = await Promise.all([span(1), span(WEEK_DAYS), span(MONTH_DAYS)]);
    return { today, week, month };
  }

  private async compact(asker: Asker, pluginId: string, key: string): Promise<boolean> {
    refuseStranger(asker, 'compact a conversation');
    const chat = await this.chatOf(asker, pluginId, key);
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
    const chat = await this.chatOf(asker, pluginId, key);
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
    const chat = await this.chatOf(asker, pluginId, key);
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
    const chat = await this.chatOf(asker, pluginId, key);
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
      {
        engine: DSH_ENGINE_REQUEST.parse({
          kind: 'dsh',
          model: resolved.model_id,
          effort: chat.engine.effort,
        }),
      },
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
