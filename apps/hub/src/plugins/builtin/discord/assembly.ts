import type { PluginContext } from '../contract';
import { Authority } from './authority';
import { Channels } from './channels';
import { ContextIndex } from './context-index';
import { Directory } from './directory';
import { Identity } from './identity';
import { Interactions } from './interactions';
import { Journal } from './journal';
import type { DiscordRest } from './link';
import type { Downloader } from './media-download';
import { MediaIndex } from './media-index';
import { MediaService } from './media-service';
import { OriginStore } from './origins';
import { Policy } from './policy';
import { Flows } from './prompts';
import { Sender } from './sender';
import type { ActivityVisibility, DiscordServices } from './services';
import type { DiscordSettings } from './settings';
import { StatusBoard } from './status-board';
import { Uploads } from './uploads';

const DAY_MS = 86_400_000;
const OPERATION_JOURNAL = { capacity: 4096, retentionMs: DAY_MS };
const REPLY_JOURNAL = { capacity: 16_384, retentionMs: 7 * DAY_MS };

export interface Assembled {
  readonly services: DiscordServices;
  readonly interactions: Interactions;
  readonly mediaIndex: MediaIndex;
}

type Context = PluginContext<DiscordSettings>;

function journalOf(
  ctx: Context,
  collection: string,
  shape: { readonly capacity: number; readonly retentionMs: number },
): Journal {
  const journal = new Journal(ctx.records(collection), shape.capacity, shape.retentionMs, Date.now);
  journal.load();
  return journal;
}

function namesOf(ctx: Context): () => readonly string[] {
  return () => {
    const { name, aliases } = ctx.assistant.settings();
    return [...(name === null ? [] : [name]), ...aliases];
  };
}

function sendRootsOf(ctx: Context): DiscordServices['sendRoots'] {
  return (chatId) => [
    ctx.files.outbox,
    ...(chatId === null ? [] : ctx.files.attachmentsOf(chatId)),
  ];
}

function activityOf(ctx: Context): ActivityVisibility {
  let visible = ctx.settings.activity_visibility;
  ctx.settingsChanged((next) => {
    visible = next.activity_visibility;
  });
  return {
    progress: () => ctx.assistant.settings().activitySteps && visible,
    set: (on) => ctx.configure({ settings: { activity_visibility: on } }),
  };
}

function statusBoardOf(rest: DiscordRest, report: (cause: unknown) => void): StatusBoard {
  return new StatusBoard(
    (message, content) =>
      rest.patch(`/channels/${message.channel_id}/messages/${message.id}`, {
        content,
        allowed_mentions: { parse: [], replied_user: false },
      }),
    (message) => rest.delete(`/channels/${message.channel_id}/messages/${message.id}`),
    report,
  );
}

function indexesOf(
  settings: DiscordSettings,
  policy: Policy,
  directory: Directory,
): { readonly media: MediaIndex; readonly context: ContextIndex } {
  return {
    media: new MediaIndex(
      policy,
      {
        enabled: settings.media_enabled,
        capture: settings.media_capture,
        maxAttachments: settings.media_max_attachments,
        ttlMinutes: settings.media_ttl_minutes,
      },
      Date.now,
    ),
    context: new ContextIndex(
      policy,
      directory,
      {
        enabled: settings.context_enabled,
        capture: settings.context_capture,
        perChannel: settings.context_per_channel,
        includeBots: settings.context_include_bots,
      },
      Date.now,
    ),
  };
}

interface Core {
  readonly policy: Policy;
  readonly channels: Channels;
  readonly origins: OriginStore;
  readonly directory: Directory;
  readonly authority: Authority;
  readonly interactions: Interactions;
}

function coreOf(ctx: Context, rest: DiscordRest, report: (cause: unknown) => void): Core {
  const policy = new Policy(ctx.settings, ctx.people, namesOf(ctx));
  const channels = new Channels(rest, policy);
  const origins = new OriginStore(ctx.records('origins'), { warn: ctx.log.warn.bind(ctx.log) });
  origins.load();
  return {
    policy,
    channels,
    origins,
    directory: new Directory(policy, ctx.people, rest, { now: Date.now, report }),
    authority: new Authority({ policy, origins, channels, rest, people: ctx.people }),
    interactions: new Interactions(rest, Date.now, report),
  };
}

export function assemble(
  ctx: Context,
  rest: DiscordRest,
  download: Downloader,
  report: (cause: unknown) => void,
): Assembled {
  const { settings } = ctx;
  const identity = new Identity();
  const core = coreOf(ctx, rest, report);
  const { policy, channels, authority, interactions } = core;
  const indexes = indexesOf(settings, policy, core.directory);
  const sender = new Sender({
    rest,
    policy,
    authority,
    channels,
    interactions,
    journal: journalOf(ctx, 'reply-journal', REPLY_JOURNAL),
    statuses: statusBoardOf(rest, report),
    now: Date.now,
    report,
  });
  const media = new MediaService({
    rest,
    policy,
    channels,
    index: indexes.media,
    download,
    settings: { enabled: settings.media_enabled, maxFileBytes: settings.media_max_file_bytes },
  });
  const services: DiscordServices = {
    ...core,
    settings,
    rest,
    identity,
    people: ctx.people,
    sender,
    journal: journalOf(ctx, 'journal', OPERATION_JOURNAL),
    context: indexes.context,
    media,
    uploads: new Uploads(Date.now),
    flows: new Flows(policy, () => identity.botId),
    assistant: ctx.assistant,
    fetchUrl: (url, signal) => fetch(url, { signal }),
    sendRoots: sendRootsOf(ctx),
    activity: activityOf(ctx),
    now: Date.now,
  };
  return { services, interactions, mediaIndex: indexes.media };
}
