import { createHash } from 'node:crypto';
import {
  IMAGE_GENERATE_INPUT,
  IMAGE_MIME,
  generateRequestOf,
  type Engine,
  type ImageModelChoice,
  type ImageOperationReceipt,
  type AiChatRow,
} from '@smarteverything/domain';
import type { NodeResult } from '@smarteverything/flow/interpret/frames';
import { Logger, messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import type { AssistantFiles } from '../../assistant/files';
import { ConversationLog } from '../../assistant/conversation-log';
import type { ImageActor, ImageOperationService } from '../../assistant/image/service';
import type { Clock } from '../../clock';
import { StoreNotFoundError } from '../../store/context';
import type { StoredAttachment } from '../../store/repositories/assistant-chat';
import type { Store } from '../../store/store';
import { effectFailure, type EffectFailureResult } from '../effect-failure';
import { outputs, parsed } from '../engine-v3-effects';
import type { IntegrationPorts } from '../integration-effects';
import { modeOf } from './action-mode';
import type { EffectHandler, EffectHandlers, EffectRun } from './effect-run';
import { IntegrationError } from './integration-error';
import { admitRun, awaitRun } from './run-abort';

const log = new Logger('hub.automations');

export const IMAGE_TIMEOUT_DEFAULT_MS = 120_000;

export interface AutomationImageActorRequest {
  readonly profileId: string;
  readonly automationId: string;
  readonly signal?: AbortSignal;
}

export interface AutomationImageSource {
  readonly service: Pick<ImageOperationService, 'start' | 'settled' | 'cancel'>;
  readonly files: Pick<AssistantFiles, 'keepBytes' | 'copy'>;
  readonly actor: (who: AutomationImageActorRequest) => ImageActor;
  readonly selectedModel: () => ImageModelChoice | null;
  readonly engine: (profileId: string) => Engine;
}

class ImagesNotReadyError extends Error {
  override readonly name = 'ImagesNotReadyError';

  constructor() {
    super('The picture service isn’t running on this server yet, so this step couldn’t run.');
  }
}

export class AutomationImagesSlot {
  private source: AutomationImageSource | null = null;

  attach(source: AutomationImageSource): void {
    this.source = source;
  }

  stop(): void {
    this.source = null;
  }

  current(): AutomationImageSource {
    if (this.source === null) throw new ImagesNotReadyError();
    return this.source;
  }
}

export interface ImageEffectPorts {
  readonly store: Store;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly images: Pick<AutomationImagesSlot, 'current'>;
  readonly integration: Pick<IntegrationPorts, 'pictures'>;
}

const CHOICE = z.string().min(1).optional();

const PARAMS = z.object({
  prompt: z.string().trim().min(1),
  model: CHOICE,
  aspect: CHOICE,
  resolution: CHOICE,
  background: CHOICE,
  references: z.array(z.string().min(1)).optional(),
  timeout: z.number().int().positive().default(IMAGE_TIMEOUT_DEFAULT_MS),
});

type Ask = z.infer<typeof PARAMS>;

interface Who {
  readonly profileId: string;
  readonly automationId: string;
  readonly name: string;
}

function whoOf(store: Store, run: EffectRun): Who {
  const row = store.automations.find(run.automationId);
  return {
    profileId: row?.author?.profile_id ?? store.profiles.first().id,
    automationId: run.automationId,
    name: row?.name ?? run.automationId,
  };
}

export function automationChatKey(automationId: string): string {
  return `automation:${automationId}`;
}

function chatOf(store: Store, source: AutomationImageSource, who: Who): AiChatRow {
  const existing = store.aiChats.bySource(who.profileId, automationChatKey(who.automationId));
  if (existing !== undefined) return existing;
  return store.aiChats.create({
    profileId: who.profileId,
    kind: 'chat',
    title: `Automation: ${who.name}`.slice(0, 80),
    icon: null,
    parentId: null,
    sourceKey: automationChatKey(who.automationId),
    engine: source.engine(who.profileId),
    titleAuto: false,
  });
}

function operationIdOf(key: string): string {
  const bytes = createHash('sha256').update(`ai.image\0${key}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function attachmentOf(store: Store, id: string): StoredAttachment | undefined {
  try {
    return store.assistantChat.attachment(id);
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return undefined;
    throw cause;
  }
}

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;

interface Importing {
  readonly ports: ImageEffectPorts;
  readonly source: AutomationImageSource;
  readonly who: Who;
  readonly signal: AbortSignal;
}

async function importedCopy(
  importing: Importing,
  file: StoredAttachment,
): Promise<StoredAttachment> {
  if (file.profile_id !== importing.who.profileId)
    throw new IntegrationError('Forbidden', `The picture ${file.id} belongs to another person.`);
  return importing.source.files.copy(file);
}

async function importedPicture(importing: Importing, id: string): Promise<StoredAttachment> {
  const picture = await importing.ports.integration.pictures.load(id);
  const mime = IMAGE_MIME.safeParse(picture.mimeType);
  if (!mime.success)
    throw new IntegrationError('Invalid', `The picture ${id} is not a PNG, JPEG or WebP image.`);
  return importing.source.files.keepBytes({
    authorize: (): void => undefined,
    profileId: importing.who.profileId,
    name: `reference.${EXTENSIONS[mime.data]}`,
    mime: mime.data,
    content: Buffer.from(picture.base64, 'base64'),
    signal: importing.signal,
  });
}

async function imported(
  importing: Importing,
  id: string,
  inChat: ReadonlySet<string>,
): Promise<StoredAttachment | string> {
  if (inChat.has(id)) return id;
  const file = attachmentOf(importing.ports.store, id);
  return file === undefined ? importedPicture(importing, id) : importedCopy(importing, file);
}

async function referencesOf(
  importing: Importing,
  chat: AiChatRow,
  ids: readonly string[],
): Promise<readonly string[]> {
  if (ids.length === 0) return [];
  const { store } = importing.ports;
  const inChat = new Set(store.assistantChat.attachmentsOfChat(chat.id).map((file) => file.id));
  const resolved: (StoredAttachment | string)[] = [];
  for (const id of ids) resolved.push(await imported(importing, id, inChat));
  const fresh = resolved.filter((entry) => typeof entry !== 'string');
  if (fresh.length > 0)
    new ConversationLog(store).responderInChat({
      chat,
      replyTo: null,
      text: 'Pictures this automation made or took, kept here as references.',
      files: fresh,
    });
  return resolved.map((entry) => (typeof entry === 'string' ? entry : entry.id));
}

function optionsOf(ask: Ask): Readonly<Record<string, string>> {
  return {
    ...(ask.aspect === undefined ? {} : { aspect_ratio: ask.aspect }),
    ...(ask.resolution === undefined ? {} : { resolution: ask.resolution }),
    ...(ask.background === undefined ? {} : { background: ask.background }),
  };
}

interface Started {
  readonly source: AutomationImageSource;
  readonly actor: ImageActor;
  readonly receipt: ImageOperationReceipt;
}

async function start(
  ports: ImageEffectPorts,
  call: { readonly ask: Ask; readonly key: string; readonly wait: boolean },
  run: EffectRun,
): Promise<Started> {
  admitRun(run);
  const source = ports.images.current();
  const who = whoOf(ports.store, run);
  const chat = chatOf(ports.store, source, who);
  const references = await referencesOf(
    { ports, source, who, signal: run.signal },
    chat,
    call.ask.references ?? [],
  );
  const input = IMAGE_GENERATE_INPUT.parse({
    chatId: chat.id,
    prompt: call.ask.prompt,
    ...(call.ask.model === undefined ? {} : { model: call.ask.model }),
    options: optionsOf(call.ask),
    references,
  });
  const actor = source.actor({
    profileId: who.profileId,
    automationId: who.automationId,
    ...(call.wait ? { signal: run.signal } : {}),
  });
  const request = generateRequestOf(input, operationIdOf(call.key), source.selectedModel());
  return { source, actor, receipt: await source.service.start(actor, request) };
}

function deadline(
  ports: ImageEffectPorts,
  milliseconds: number,
): { readonly expired: Promise<never>; readonly clear: () => void } {
  let clear = (): void => undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    clear = ports.clock.at(new Date(ports.clock.now().getTime() + milliseconds), () => {
      reject(
        new IntegrationError(
          'Timeout',
          `The picture was not ready within ${String(Math.round(milliseconds / 1000))} seconds, so the request was cancelled.`,
          'image_timeout',
        ),
      );
    });
  });
  return {
    expired,
    clear: (): void => {
      clear();
    },
  };
}

function cancelLate(started: Started): void {
  try {
    started.source.service.cancel(started.actor, started.receipt.id);
  } catch (cause) {
    log.warn('automation.image_cancel_failed', {
      operationId: started.receipt.id,
      reason: messageOf(cause),
    });
  }
}

async function settledWithin(
  ports: ImageEffectPorts,
  started: Started,
  limit: { readonly milliseconds: number; readonly run: EffectRun },
): Promise<ImageOperationReceipt> {
  const waiting = deadline(ports, limit.milliseconds);
  try {
    return await Promise.race([
      awaitRun(started.source.service.settled(started.actor, started.receipt.id), limit.run),
      waiting.expired,
    ]);
  } catch (cause) {
    if (cause instanceof IntegrationError && cause.kind === 'Timeout') cancelLate(started);
    throw cause;
  } finally {
    waiting.clear();
  }
}

function failed(message: string, code: string): EffectFailureResult {
  return { ok: false, class: 'Failed', message, code };
}

function finished(receipt: ImageOperationReceipt): NodeResult {
  if (receipt.state !== 'completed')
    return failed(
      receipt.reason ?? `The picture was not made (${receipt.state}).`,
      `image_${receipt.state}`,
    );
  const first = receipt.results[0];
  if (first === undefined) return failed('The picture service returned no picture.', 'image_empty');
  const cost = receipt.usage?.['cost'];
  return {
    ok: true,
    value: outputs({ picture: first.attachment.id, ...(cost === undefined ? {} : { cost }) }),
  };
}

function aiImage(ports: ImageEffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(PARAMS, params);
    if (!checked.ok) return checked;
    const wait = modeOf(request) === 'wait_for_result';
    try {
      const started = await start(ports, { ask: checked.value, key: request.key, wait }, run);
      if (!wait) return { ok: true, value: outputs({}) };
      const receipt = await settledWithin(ports, started, {
        milliseconds: checked.value.timeout,
        run,
      });
      return finished(receipt);
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function imageEffects(ports: ImageEffectPorts): EffectHandlers {
  return { 'ai.image': aiImage(ports) };
}
