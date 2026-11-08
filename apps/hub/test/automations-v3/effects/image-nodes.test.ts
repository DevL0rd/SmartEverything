import { randomUUID } from 'node:crypto';
import {
  IMAGE_ARTIFACT,
  IMAGE_OPERATION_RECEIPT,
  IMAGE_OPERATION_REQUEST,
  NODE_REGISTRY,
  type ImageOperationReceipt,
  type ImageOperationRequest,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { AssistantFiles } from '../../../src/assistant/files';
import { StoredPictures } from '../../../src/automations/effects/camera-pictures';
import { pictureFileReader } from '../../../src/plugins/picture-file';
import type { ImageActor } from '../../../src/assistant/image/service';
import {
  AutomationImagesSlot,
  IMAGE_TIMEOUT_DEFAULT_MS,
  automationChatKey,
  imageEffects,
  type AutomationImageActorRequest,
  type AutomationImageSource,
} from '../../../src/automations/effects/image-nodes';
import { summaryOf } from '../../../src/store/repositories/assistant-chat';
import { FakeClock } from '../../support/fake-clock';
import { testStore, type TestStore } from '../../support/store';
import { testRun, type TestRun } from './support';
import { TEST_ENGINE } from '../../support/engine';
import { hubLayout } from '../../../src/data-layout';

const PICTURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

type Outcome = 'completed' | 'failed' | 'never';

interface Behaviour {
  outcome: Outcome;
  usage: Record<string, number> | null;
  reason: string | null;
}

interface Rig {
  readonly db: TestStore;
  readonly clock: FakeClock;
  readonly requests: ImageOperationRequest[];
  readonly actors: AutomationImageActorRequest[];
  readonly cancelled: string[];
  readonly behaviour: Behaviour;
  readonly loaded: string[];
  readonly files: AssistantFiles;
  readonly images: AutomationImagesSlot;
  readonly handler: ReturnType<typeof imageEffects>[string];
  readonly store: TestStore['store'];
}

const open: TestStore[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

async function rig(): Promise<Rig> {
  const db = await testStore();
  open.push(db);
  const { store } = db;
  const clock = new FakeClock('2026-10-08T10:00:00.000Z');
  const files = new AssistantFiles({
    layout: hubLayout(db.directory, {}),
    chat: store.assistantChat,
    now: clock.now,
  });
  const behaviour: Behaviour = { outcome: 'completed', usage: { cost: 0.04 }, reason: null };
  const requests: ImageOperationRequest[] = [];
  const actors: AutomationImageActorRequest[] = [];
  const cancelled: string[] = [];
  const loaded: string[] = [];
  const receipts = new Map<string, ImageOperationReceipt>();
  const settle = async (id: string): Promise<ImageOperationReceipt> => {
    const receipt = receipts.get(id);
    if (receipt === undefined) throw new Error('unknown operation');
    if (behaviour.outcome === 'never') return new Promise<never>(() => undefined);
    if (behaviour.outcome === 'failed')
      return { ...receipt, state: 'failed', reason: behaviour.reason };
    const file = await files.keepBytes({
      authorize: (): void => undefined,
      profileId: receipt.profile_id,
      name: 'image-1.png',
      mime: 'image/png',
      content: PICTURE,
      signal: new AbortController().signal,
    });
    new ConversationLog(store).responderInChat({
      chat: store.aiChats.chat(receipt.chat_id),
      replyTo: null,
      text: receipt.request.prompt,
      files: [file],
    });
    return {
      ...receipt,
      state: 'completed',
      usage: behaviour.usage,
      results: [
        IMAGE_ARTIFACT.parse({
          attachment: summaryOf(file),
          operation_id: receipt.id,
          parents: [],
          sha256: file.sha256,
        }),
      ],
    };
  };
  const source: AutomationImageSource = {
    files,
    engine: () => TEST_ENGINE,
    selectedModel: () => ({ model: 'vendor/painter', provider_tag: 'fast' }),
    actor: (who): ImageActor => {
      actors.push(who);
      return {
        profileId: who.profileId,
        key: `automation:${who.automationId}`,
        authorize: (): void => undefined,
        ...(who.signal === undefined ? {} : { signal: who.signal }),
      };
    },
    service: {
      start: (actor, value): Promise<ImageOperationReceipt> => {
        const asked = IMAGE_OPERATION_REQUEST.parse(value);
        requests.push(asked);
        const stamp = clock.now().toISOString();
        const receipt = IMAGE_OPERATION_RECEIPT.parse({
          id: asked.operation_id,
          profile_id: actor.profileId,
          chat_id: asked.chat_id,
          request: asked,
          endpoint: {
            model: asked.model,
            name: 'Painter',
            provider_tag: 'fast',
            parameters: {},
            supports_streaming: false,
            pricing: [],
          },
          inputs: [],
          state: 'running',
          progress: 0,
          results: [],
          message_id: null,
          created_at: stamp,
          updated_at: stamp,
          reason: null,
          usage: null,
        });
        receipts.set(receipt.id, receipt);
        return Promise.resolve(receipt);
      },
      settled: (_actor, id) => settle(id),
      cancel: (_actor, id): ImageOperationReceipt => {
        cancelled.push(id);
        const receipt = receipts.get(id);
        if (receipt === undefined) throw new Error('unknown operation');
        return receipt;
      },
    },
  };
  const images = new AutomationImagesSlot();
  images.attach(source);
  const handlers = imageEffects({
    store,
    clock,
    images,
    integration: {
      pictures: {
        take: () => Promise.reject(new Error('not used')),
        load: (id) => {
          loaded.push(id);
          return Promise.resolve({
            mimeType: 'image/jpeg',
            base64: PICTURE.toString('base64'),
          });
        },
      },
    },
  });
  const handler = handlers['ai.image'];
  if (handler === undefined) throw new Error('ai.image has no handler');
  return {
    db,
    clock,
    requests,
    actors,
    cancelled,
    behaviour,
    loaded,
    files,
    images,
    handler,
    store,
  };
}

function request(
  params: EffectRequest['params'],
  extra: { readonly key?: string; readonly mode?: EffectRequest['mode'] } = {},
): EffectRequest {
  return {
    kind: 'ai.image',
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: extra.key ?? 'run-1/0',
    params,
    retry: 'external',
    budget: 'effects_person',
    ...(extra.mode === undefined ? {} : { mode: extra.mode }),
  };
}

async function make(
  home: Rig,
  params: EffectRequest['params'],
  extra: {
    readonly key?: string;
    readonly mode?: EffectRequest['mode'];
    readonly run?: TestRun;
  } = {},
): Promise<NodeResult> {
  return home.handler(params, request(params, extra), extra.run ?? testRun());
}

function valueOf(result: NodeResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`failed: ${result.class} ${result.message}`);
  return z.record(z.string(), z.unknown()).parse(result.value);
}

async function settledTurn(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe('ai.image in the node library', () => {
  it('asks for a picture and a cost, waits by default and gives up after 120 seconds', () => {
    const kind = NODE_REGISTRY.get('ai.image');
    expect(kind?.outputs.map((port) => port.name)).toEqual(['picture', 'cost', 'error']);
    expect(kind?.effect?.mode).toBe('wait_for_result');
    const timeout = kind?.inputs.find((port) => port.name === 'timeout');
    expect(timeout?.default).toBe(IMAGE_TIMEOUT_DEFAULT_MS);
    expect(IMAGE_TIMEOUT_DEFAULT_MS).toBe(120_000);
  });
});

describe('ai.image handler', () => {
  it('makes the picture in a chat of the automation and returns its id and cost', async () => {
    const home = await rig();
    const run = testRun();
    const value = valueOf(
      await make(
        home,
        { prompt: 'a red door', aspect: '16:9', resolution: '2K', background: 'opaque' },
        { run },
      ),
    );
    const [asked] = home.requests;
    if (asked === undefined) throw new Error('no request was made');
    const chat = home.store.aiChats.chat(asked.chat_id);
    expect(chat.source_key).toBe(automationChatKey(run.automationId));
    expect(chat.kind).toBe('chat');
    expect(asked).toMatchObject({
      mode: 'generate',
      prompt: 'a red door',
      model: 'vendor/painter',
      provider_tag: 'fast',
      options: { aspect_ratio: '16:9', resolution: '2K', background: 'opaque' },
    });
    const kept = home.store.assistantChat.attachment(String(value['picture']));
    expect(kept.mime).toBe('image/png');
    expect(value['cost']).toBe(0.04);
    expect(Object.keys(value).sort()).toEqual(['cost', 'picture']);
  });

  it('uses the model that was picked and leaves the cost out when it is unknown', async () => {
    const home = await rig();
    home.behaviour.usage = null;
    const value = valueOf(await make(home, { prompt: 'a lamp', model: 'other/draw' }));
    expect(home.requests[0]).toMatchObject({ model: 'other/draw' });
    expect(value['cost']).toBeUndefined();
    expect(typeof value['picture']).toBe('string');
  });

  it('keeps one chat per automation across runs', async () => {
    const home = await rig();
    const first = testRun();
    const second = testRun();
    await make(home, { prompt: 'one' }, { run: first, key: 'a' });
    await make(home, { prompt: 'two' }, { run: first, key: 'b' });
    await make(home, { prompt: 'three' }, { run: second, key: 'c' });
    const chats = home.requests.map((asked) => asked.chat_id);
    expect(chats[0]).toBe(chats[1]);
    expect(chats[2]).not.toBe(chats[0]);
  });

  it('derives the operation id from the effect key so a replay is the same operation', async () => {
    const home = await rig();
    await make(home, { prompt: 'one' }, { key: 'run-9/3' });
    await make(home, { prompt: 'one' }, { key: 'run-9/3' });
    await make(home, { prompt: 'one' }, { key: 'run-9/4' });
    const ids = home.requests.map((asked) => asked.operation_id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('continues as soon as the request is accepted when sending', async () => {
    const home = await rig();
    home.behaviour.outcome = 'never';
    const run = testRun();
    const result = await make(home, { prompt: 'a cat' }, { mode: 'fire_and_forget', run });
    expect(valueOf(result)).toEqual({});
    expect(home.requests).toHaveLength(1);
    expect(home.actors[0]?.signal).toBeUndefined();
  });

  it('gives the run signal to the request while waiting and stops when the run is cancelled', async () => {
    const home = await rig();
    home.behaviour.outcome = 'never';
    const run = testRun();
    const pending = make(home, { prompt: 'a cat' }, { run });
    await settledTurn();
    expect(home.actors[0]?.signal).toBe(run.signal);
    run.controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AutomationRunCancelledError' });
  });

  it('times out with the Timeout class and cancels the request', async () => {
    const home = await rig();
    home.behaviour.outcome = 'never';
    const pending = make(home, { prompt: 'a cat', timeout: 30_000 });
    await settledTurn();
    home.clock.advanceTo('2026-10-08T10:00:30.000Z');
    const result = await pending;
    expect(result).toMatchObject({ ok: false, class: 'Timeout', code: 'image_timeout' });
    expect(home.cancelled).toEqual([home.requests[0]?.operation_id]);
  });

  it('waits the default 120 seconds when no timeout is given', async () => {
    const home = await rig();
    home.behaviour.outcome = 'never';
    const pending = make(home, { prompt: 'a cat' });
    await settledTurn();
    home.clock.advanceTo('2026-10-08T10:01:59.000Z');
    expect(home.cancelled).toEqual([]);
    home.clock.advanceTo('2026-10-08T10:02:00.000Z');
    expect(await pending).toMatchObject({ ok: false, class: 'Timeout' });
  });

  it('reports a failed picture with the reason the service gave', async () => {
    const home = await rig();
    home.behaviour.outcome = 'failed';
    home.behaviour.reason = 'The model refused the prompt.';
    const result = await make(home, { prompt: 'a cat' });
    expect(result).toMatchObject({
      ok: false,
      class: 'Failed',
      message: 'The model refused the prompt.',
      code: 'image_failed',
    });
  });

  it('fails with a plain message while the picture service is not running', async () => {
    const home = await rig();
    home.images.stop();
    const result = await make(home, { prompt: 'a cat' });
    expect(result).toMatchObject({ ok: false, class: 'Failed' });
    expect(result.ok ? '' : result.message).toContain('picture service');
  });

  it('rejects an empty prompt before anything is made', async () => {
    const home = await rig();
    const result = await make(home, { prompt: '   ' });
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(home.requests).toEqual([]);
  });
});

describe('ai.image references', () => {
  it('keeps a camera picture in the automation chat and refers to it', async () => {
    const home = await rig();
    const run = testRun();
    const loadedId = randomUUID();
    await make(home, { prompt: 'in this style', references: [loadedId] }, { run });
    const [asked] = home.requests;
    if (asked?.mode !== 'reference') throw new Error('expected a reference request');
    expect(home.loaded).toEqual([loadedId]);
    const [reference] = asked.references;
    if (reference?.kind !== 'attachment') throw new Error('expected an attachment reference');
    const kept = home.store.assistantChat.attachmentsOfChat(asked.chat_id);
    const stored = kept.find((file) => file.id === reference.attachment_id);
    expect(stored?.mime).toBe('image/jpeg');
    expect(kept.filter((file) => file.mime === 'image/jpeg')).toHaveLength(1);
  });

  it('refers to a picture already in the chat without keeping a second copy', async () => {
    const home = await rig();
    const run = testRun();
    const first = valueOf(await make(home, { prompt: 'one' }, { key: 'a', run }));
    const picture = String(first['picture']);
    await make(home, { prompt: 'again', references: [picture] }, { key: 'b', run });
    const asked = home.requests[1];
    if (asked?.mode !== 'reference') throw new Error('expected a reference request');
    expect(asked.references).toEqual([{ kind: 'attachment', attachment_id: picture }]);
    expect(home.loaded).toEqual([]);
    expect(home.store.assistantChat.attachmentsOfChat(asked.chat_id)).toHaveLength(2);
  });

  it('keeps an earlier picture of another automation as a copy in this chat', async () => {
    const home = await rig();
    const earlier = valueOf(await make(home, { prompt: 'one' }, { key: 'a' }));
    const picture = String(earlier['picture']);
    const run = testRun();
    await make(home, { prompt: 'redo it', references: [picture] }, { key: 'b', run });
    const asked = home.requests[1];
    if (asked?.mode !== 'reference') throw new Error('expected a reference request');
    const [reference] = asked.references;
    if (reference?.kind !== 'attachment') throw new Error('expected an attachment reference');
    expect(reference.attachment_id).not.toBe(picture);
    expect(home.loaded).toEqual([]);
    const copy = home.store.assistantChat.attachment(reference.attachment_id);
    expect(copy.sha256).toBe(home.store.assistantChat.attachment(picture).sha256);
  });

  it('refuses a picture that belongs to another person', async () => {
    const home = await rig();
    const earlier = valueOf(await make(home, { prompt: 'one' }, { key: 'a' }));
    const other = home.store.profiles.create({ name: 'Sam' });
    const row = home.store.assistantChat.attachment(String(earlier['picture']));
    const foreign = home.store.assistantChat.addAttachment({
      id: randomUUID(),
      profile_id: other.id,
      name: row.name,
      mime: row.mime,
      bytes: row.bytes,
      width: null,
      height: null,
      storage_path: row.storage_path,
      sha256: row.sha256,
    });
    const result = await make(home, { prompt: 'copy it', references: [foreign.id] }, { key: 'b' });
    expect(result).toMatchObject({ ok: false, class: 'Forbidden' });
    expect(home.requests).toHaveLength(1);
  });
});

describe('a made picture where a camera picture id goes', () => {
  async function madeId(home: Rig): Promise<string> {
    const value = valueOf(await make(home, { prompt: 'a red door' }));
    return z.string().parse(value['picture']);
  }

  function pictures(home: Rig): StoredPictures {
    return new StoredPictures({
      snapshot: () => Promise.reject(new Error('not used')),
      recordings: home.store.cameras,
      recordingPath: (path) => join(home.db.directory, 'recordings', path),
      attachments: home.store.assistantChat,
      attachmentPath: (file) => home.files.pathOf(file),
      now: () => home.clock.now(),
    });
  }

  function reader(home: Rig): ReturnType<typeof pictureFileReader> {
    return pictureFileReader({
      store: home.store,
      recordingPath: (path) => join(home.db.directory, 'recordings', path),
      attachmentPath: (file) => home.files.pathOf(file),
    });
  }

  function caller(
    profileId: string,
    role: 'owner' | 'member',
  ): Parameters<ReturnType<typeof reader>>[0] {
    return { profileId, role, chatId: null, clientId: null, via: 'app' };
  }

  it('loads for notify and ai.vision through the stored pictures', async () => {
    const home = await rig();
    const id = await madeId(home);
    expect(await pictures(home).load(id)).toEqual({
      mimeType: 'image/png',
      base64: PICTURE.toString('base64'),
    });
  });

  it('still says there is no picture for an id that is neither a snapshot nor an image', async () => {
    const home = await rig();
    await expect(pictures(home).load(randomUUID())).rejects.toMatchObject({ kind: 'NotFound' });
  });

  it('reads as a file for Discord and the printer for the owner and for the person who owns it', async () => {
    const home = await rig();
    const id = await madeId(home);
    const owner = home.actors[0]?.profileId ?? '';
    const asOwner = await reader(home)(caller('someone-else', 'owner'), id);
    expect(asOwner?.data).toEqual(PICTURE);
    const asPerson = await reader(home)(caller(owner, 'member'), id);
    expect(asPerson?.data).toEqual(PICTURE);
  });

  it('is not readable by another person and unknown ids give nothing', async () => {
    const home = await rig();
    const id = await madeId(home);
    expect(await reader(home)(caller('someone-else', 'member'), id)).toBeNull();
    expect(await reader(home)(caller('someone-else', 'owner'), randomUUID())).toBeNull();
  });
});
