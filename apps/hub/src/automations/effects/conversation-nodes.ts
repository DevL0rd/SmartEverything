import {
  IMAGE_MIME,
  SPEECH_SOURCE,
  TRANSCRIPT_PAGE,
  TRANSCRIPT_PAGE_LIMIT,
  WAKE_SENSITIVITIES,
  type JsonValue,
  type SpeechSource,
  type TranscriptHit,
  type TranscriptPage,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';
import type { Clock } from '../../clock';
import { StoreNotFoundError } from '../../store/context';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import type { IntegrationPorts } from '../integration-effects';
import { PERSON_REF, personRefs } from '../world-v3/refs';
import { modeOf } from './action-mode';
import { deliver } from './deliver';
import type { EffectHandler, EffectHandlers } from './effect-run';
import type { AutomationImagesSlot } from './image-nodes';
import { IntegrationError } from './integration-error';
import { admitRun } from './run-abort';
import { callTool, type JsonObject } from './tool';

export interface ConversationEffectPorts {
  readonly store: Pick<Store, 'profiles' | 'assistantChat'>;
  readonly integration: Pick<IntegrationPorts, 'tools' | 'pictures' | 'ownerProfileId'>;
  readonly images: Pick<AutomationImagesSlot, 'current'>;
  readonly clock: Pick<Clock, 'now'>;
}

interface Identity {
  readonly profileId: string;
  readonly role: 'owner' | 'member';
}

const log = new Logger('hub.automations');

const NO_PLUGIN = { plugin: null } as const;

const ID = z.string().min(1);

const PERSON = z.union([ID, PERSON_REF]);

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;

function identityOf(ports: ConversationEffectPorts): Identity {
  const authority = currentExecutionAuthority();
  return {
    profileId: authority?.profile_id ?? ports.integration.ownerProfileId(),
    role: authority === undefined ? 'owner' : executionRole(authority),
  };
}

function useTool(
  ports: ConversationEffectPorts,
  who: Identity,
  tool: string,
  args: Readonly<Record<string, JsonValue>>,
): Promise<JsonObject> {
  return callTool(ports.integration.tools, { profileId: who.profileId, tool, args }, NO_PLUGIN);
}

const POST_PARAMS = z.object({
  person: PERSON.optional(),
  text: z.string().trim().default(''),
  picture: ID.optional(),
  notify: z.boolean().default(true),
});

type PostAsk = z.infer<typeof POST_PARAMS>;

const POSTED = z.object({ result: z.object({ id: ID }) });

function attachmentOf(
  store: ConversationEffectPorts['store'],
  id: string,
): { readonly id: string; readonly profile_id: string } | undefined {
  try {
    return store.assistantChat.attachment(id);
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return undefined;
    throw cause;
  }
}

async function pictureFile(
  ports: ConversationEffectPorts,
  target: string,
  pictureId: string,
  signal: AbortSignal,
): Promise<string> {
  const known = attachmentOf(ports.store, pictureId);
  if (known !== undefined) {
    if (known.profile_id !== target) {
      throw new IntegrationError(
        'Forbidden',
        `The picture ${pictureId} belongs to another person, so it cannot go into this chat.`,
      );
    }
    return known.id;
  }
  const picture = await ports.integration.pictures.load(pictureId);
  const mime = IMAGE_MIME.safeParse(picture.mimeType);
  if (!mime.success) {
    throw new IntegrationError('Invalid', `${pictureId} is not a PNG, JPEG or WebP picture.`);
  }
  const kept = await ports.images.current().files.keepBytes({
    authorize: (): void => undefined,
    profileId: target,
    name: `picture.${EXTENSIONS[mime.data]}`,
    mime: mime.data,
    content: Buffer.from(picture.base64, 'base64'),
    signal,
  });
  return kept.id;
}

async function postMessage(
  ports: ConversationEffectPorts,
  post: { readonly who: Identity; readonly target: string; readonly ask: PostAsk },
  signal: AbortSignal,
): Promise<string> {
  const { who, target, ask } = post;
  const files =
    ask.picture === undefined
      ? []
      : [{ uploadId: await pictureFile(ports, target, ask.picture, signal) }];
  const response = await useTool(ports, who, 'chat_post', {
    text: ask.text,
    files,
    notify: ask.notify,
    personId: target,
  });
  return POSTED.parse(response).result.id;
}

function chatPost(ports: ConversationEffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(POST_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    if (ask.text === '' && ask.picture === undefined)
      return invalid('Give some text or a picture.');
    try {
      const who = identityOf(ports);
      const target = ask.person ?? who.profileId;
      if (who.role !== 'owner' && target !== who.profileId) {
        throw new IntegrationError('Forbidden', 'You can post only to your own chat.');
      }
      const messageId = await deliver({
        kind: request.kind,
        mode: modeOf(request),
        run,
        work: () => postMessage(ports, { who, target, ask }, run.signal),
      });
      return { ok: true, value: outputs(messageId === undefined ? {} : { messageId }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

const READ_PARAMS = z.object({
  source: ID,
  last: z.number().nonnegative(),
  search: z.string().trim().min(1).optional(),
});

const READ_PAGE = z.object({ result: z.object({ result: TRANSCRIPT_PAGE }) });

const NO_SPEECH_SOURCE = 'Pick where the speech was heard.';

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    log.warn('automation.speech_source_unreadable', { reason: messageOf(cause) });
    throw new IntegrationError('Invalid', NO_SPEECH_SOURCE);
  }
}

function speechSourceOf(text: string): SpeechSource {
  const found = SPEECH_SOURCE.safeParse(parsedJson(text));
  if (!found.success) throw new IntegrationError('Invalid', NO_SPEECH_SOURCE);
  return found.data;
}

function scopeOf(text: string): Readonly<Record<string, string>> {
  const source = speechSourceOf(text);
  switch (source.kind) {
    case 'camera':
    case 'phone':
    case 'computer':
      return { source: source.kind, sourceId: source.deviceId };
    case 'plugin':
      return { source: 'plugin', sourceId: source.sourceId };
    case 'attachment':
      throw new IntegrationError('Invalid', 'A chat’s attachments have no speech to read here.');
  }
}

interface Reading {
  readonly who: Identity;
  readonly args: Readonly<Record<string, JsonValue>>;
  readonly since: number;
}

async function pageOf(
  ports: ConversationEffectPorts,
  reading: Reading,
  cursor: string | null,
): Promise<TranscriptPage> {
  const response = await useTool(ports, reading.who, 'transcript_read', {
    ...reading.args,
    limit: TRANSCRIPT_PAGE_LIMIT,
    ...(cursor === null ? {} : { cursor }),
  });
  return READ_PAGE.parse(response).result.result;
}

async function hitsSince(
  ports: ConversationEffectPorts,
  reading: Reading,
  cursor: string | null,
  run: { readonly runId: string; readonly signal: AbortSignal },
): Promise<readonly TranscriptHit[]> {
  admitRun(run);
  const page = await pageOf(ports, reading, cursor);
  const inside = page.items.filter((hit) => Date.parse(hit.line.at) >= reading.since);
  if (inside.length < page.items.length || page.before === null) return inside;
  return [...(await hitsSince(ports, reading, page.before, run)), ...inside];
}

function speakersOf(ports: ConversationEffectPorts, hits: readonly TranscriptHit[]): JsonValue {
  const people = new Set(ports.store.profiles.list().map((profile) => profile.id));
  const spoke = hits.flatMap(({ line }) =>
    line.speaker_id !== null && people.has(line.speaker_id) ? [line.speaker_id] : [],
  );
  return personRefs([...new Set(spoke)]);
}

function transcriptRead(ports: ConversationEffectPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(READ_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      const reading: Reading = {
        who: identityOf(ports),
        args: {
          view: ask.search === undefined ? 'feed' : 'search',
          ...scopeOf(ask.source),
          ...(ask.search === undefined ? {} : { q: ask.search }),
        },
        since: ports.clock.now().getTime() - ask.last,
      };
      const hits = await hitsSince(ports, reading, null, run);
      return {
        ok: true,
        value: outputs({
          text: hits.map(({ line }) => `${line.speaker}: ${line.text}`).join('\n'),
          lines: hits.map(({ line }) => ({
            at: line.at,
            speaker: line.speaker,
            text: line.text,
            bot: line.bot,
          })),
          speakers: speakersOf(ports, hits),
        }),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

const LISTENING_PARAMS = z.object({
  source: ID,
  wake: z.boolean().optional(),
  transcribe: z.boolean().optional(),
  sensitivity: z.enum(WAKE_SENSITIVITIES).optional(),
});

function changedFields(
  change: Omit<z.infer<typeof LISTENING_PARAMS>, 'source'>,
): Readonly<Record<string, JsonValue>> {
  const { wake, transcribe, sensitivity } = change;
  return {
    ...(wake === undefined ? {} : { wake }),
    ...(transcribe === undefined ? {} : { transcribe }),
    ...(sensitivity === undefined ? {} : { sensitivity }),
  };
}

function listeningSet(ports: ConversationEffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(LISTENING_PARAMS, params);
    if (!checked.ok) return checked;
    const { source, ...change } = checked.value;
    const changes = changedFields(change);
    if (Object.keys(changes).length === 0) {
      return invalid(
        'Choose what to change: hearing the name, writing down speech or sensitivity.',
      );
    }
    try {
      const who = identityOf(ports);
      await deliver({
        kind: request.kind,
        mode: modeOf(request),
        run,
        work: () => useTool(ports, who, 'listening_edit', { sourceKey: source, ...changes }),
      });
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function conversationEffects(ports: ConversationEffectPorts): EffectHandlers {
  return {
    'chat.post': chatPost(ports),
    'transcript.read': transcriptRead(ports),
    'listening.set': listeningSet(ports),
  };
}
