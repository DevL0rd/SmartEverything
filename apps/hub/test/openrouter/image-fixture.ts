import { createHash } from 'node:crypto';
import {
  DEFAULT_ENGINE,
  IMAGE_OPERATION_REQUEST,
  type ImageOperationReceipt,
} from '@smarteverything/domain';
import sharp from 'sharp';
import { z } from 'zod';
import { AssistantFiles } from '../../src/assistant/files';
import { ImageOperationService } from '../../src/assistant/image/service';
import { OpenRouterClient } from '../../src/openrouter/client';
import { OpenRouterImageCatalog } from '../../src/openrouter/image-catalog';
import { OpenRouterImageProvider } from '../../src/openrouter/image-provider';
import type { TestStore } from '../support/store';

const PNG_SIDE = 16;
export function png(): Promise<Buffer> {
  return sharp({
    create: { width: PNG_SIDE, height: PNG_SIDE, channels: 3, background: '#336699' },
  })
    .png()
    .toBuffer();
}

export function modelsBody(ids: readonly string[]): string {
  return JSON.stringify({
    data: ids.map((id) => ({
      id,
      name: id,
      created: 1,
      description: id,
      architecture: { input_modalities: ['text'], output_modalities: ['image'] },
      endpoints: `/api/v1/images/models/${id}/endpoints`,
    })),
  });
}

export function endpointsBody(pricing: readonly unknown[] = []): string {
  return JSON.stringify({
    endpoints: [
      {
        provider_tag: 'tag',
        supported_parameters: { n: { type: 'range', min: 1, max: 4 } },
        supports_streaming: true,
        pricing,
      },
    ],
  });
}

export function event(type: string, fields: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ type, ...fields })}\n\n`;
}

export function hanging(signal: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    });
  });
}

export function eventStream(text: string): Response {
  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

const BODY = z.record(z.string(), z.unknown());
export function urlOf(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
}
export interface FakeOpenRouter {
  readonly fetch: typeof fetch;
  readonly requests: string[];
}

export function fakeOpenRouter(
  models: readonly string[],
  image: (body: z.infer<typeof BODY>, signal: AbortSignal) => Promise<Response>,
): FakeOpenRouter {
  const requests: string[] = [];
  const transport: typeof fetch = (input, init) => {
    const url = urlOf(input);
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname === '/api/v1/images/models')
      return Promise.resolve(new Response(modelsBody(models)));
    if (url.pathname.endsWith('/endpoints')) return Promise.resolve(new Response(endpointsBody()));
    return image(
      BODY.parse(JSON.parse(typeof init?.body === 'string' ? init.body : '{}')),
      init?.signal ?? new AbortController().signal,
    );
  };
  return { fetch: transport, requests };
}

export class MemoryFiles extends AssistantFiles {
  saved = 0;
  constructor(
    private readonly rig: TestStore,
    private readonly failFrom = Infinity,
  ) {
    super({
      dataDirectory: rig.directory,
      chat: rig.store.assistantChat,
      now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    });
  }
  override keepBytes(
    input: Parameters<AssistantFiles['keepBytes']>[0],
  ): ReturnType<AssistantFiles['keepBytes']> {
    input.authorize();
    if (this.saved >= this.failFrom) return Promise.reject(new Error('disk full'));
    this.saved += 1;
    return Promise.resolve(
      this.rig.store.assistantChat.addAttachment({
        id: crypto.randomUUID(),
        profile_id: input.profileId,
        name: input.name,
        mime: input.mime,
        bytes: input.content.length,
        width: null,
        height: null,
        storage_path: `memory/${input.name}`,
        sha256: createHash('sha256').update(input.content).digest('hex'),
      }),
    );
  }
}

export interface ImageRig {
  readonly service: ImageOperationService;
  readonly catalog: OpenRouterImageCatalog;
  readonly previews: number[];
  readonly start: (
    options: Record<string, unknown>,
    operationId?: string,
  ) => Promise<ImageOperationReceipt>;
  readonly settle: (id: string) => Promise<ImageOperationReceipt>;
  readonly cancel: (id: string) => ImageOperationReceipt;
}

function newChat(rig: TestStore): { readonly profileId: string; readonly chatId: string } {
  const profileId = rig.store.profiles.first().id;
  const chat = rig.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Images',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  });
  return { profileId, chatId: chat.id };
}

export function imageRig(
  rig: TestStore,
  transport: FakeOpenRouter,
  files: AssistantFiles = new MemoryFiles(rig),
): ImageRig {
  const client = new OpenRouterClient({ fetch: transport.fetch, key: (): string => 'key' });
  const catalog = new OpenRouterImageCatalog({
    client,
    store: rig.store.aiModels,
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
  });
  const previews: number[] = [];
  const service = new ImageOperationService({
    store: rig.store,
    repository: rig.store.imageOperations,
    files,
    catalog,
    provider: new OpenRouterImageProvider(client),
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    publish: (): void => undefined,
    preview: (preview): void => {
      previews.push(preview.bytes);
    },
    failed: (): void => undefined,
  });
  const { profileId, chatId } = newChat(rig);
  const actor = { profileId, key: 'actor', authorize: (): void => undefined };
  return {
    service,
    catalog,
    previews,
    start: (options, operationId = crypto.randomUUID()) =>
      service.start(
        actor,
        IMAGE_OPERATION_REQUEST.parse({
          mode: 'generate',
          operation_id: operationId,
          chat_id: chatId,
          prompt: 'a lamp',
          model: 'vendor/m1',
          provider_tag: 'tag',
          options,
        }),
      ),
    settle: (id) => service.settled(actor, id),
    cancel: (id) => service.cancel(actor, id),
  };
}
