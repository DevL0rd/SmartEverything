import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import type { LlmModelInfo, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import {
  AI_HARNESS_CAPABILITY,
  AI_HARNESS_ENDPOINTS,
  type HarnessRuntimeRequest,
} from '@smarteverything/domain';
import type { HarnessAttachment } from '../src/process/attachments';
import { originalMediaId } from '../src/process/media-reference';
import { SUBAGENT_MODEL_POLICY_EVENT } from '../src/plugins/subagents';
import { spoken } from './support/runtime';
import { bootDispatcher, type DispatcherFixture, type Opened } from './support/dispatcher';
import {
  route,
  runningChild,
  waitForHelperSettlement,
  replaceWriter,
} from './support/native-helper';

let fixture: DispatcherFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

it('advertises directed attachments only when it can load them', async () => {
  const host = await bootDispatcher();
  fixture = host;

  expect(host.dispatcher.runtime.manifest().features).toContain('subagent-send');
  expect(host.dispatcher.runtime.manifest().features).not.toContain('subagent-attachments');
});

it('publishes the native helper features through the chat catalogue contract', async () => {
  const imageId = randomUUID();
  const textId = randomUUID();
  fixture = await bootWithCopiedAttachments(imageId, textId, vi.fn(), Promise.resolve());
  const manifest = fixture.dispatcher.runtime.manifest();
  const payload = {
    capability: AI_HARNESS_CAPABILITY,
    hosts: [
      {
        target: { kind: 'server' },
        name: 'Home Hub',
        online: true,
        runtime_instance: randomUUID(),
        connection_generation: randomUUID(),
        manifest,
        platform: 'linux',
        unavailable_reason: null,
      },
    ],
    routes: [],
  };
  const wirePayload: unknown = JSON.parse(JSON.stringify(payload));
  const catalogue = AI_HARNESS_ENDPOINTS.readAiHarnessCatalogue.response.parse(wirePayload);

  expect(catalogue.hosts[0]?.manifest?.features).toEqual(manifest.features);
  expect(catalogue.hosts[0]?.manifest?.features).toEqual(
    expect.arrayContaining(['subagent-send', 'subagent-resume', 'subagent-attachments']),
  );
});

type Prompt = Extract<HarnessRuntimeRequest, { kind: 'prompt' }>;

function attachmentGate(): { readonly open: () => void; readonly wait: Promise<void> } {
  let open: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, wait };
}

function bootWithCopiedAttachments(
  imageId: string,
  textId: string,
  loaded: (sessionId: string, ids: readonly string[]) => void,
  beforeLoad: Promise<void>,
): Promise<DispatcherFixture> {
  return bootDispatcher(undefined, undefined, {
    loadAttachments: async function* (sessionId, ids): AsyncIterable<HarnessAttachment> {
      loaded(sessionId, ids);
      await beforeLoad;
      yield {
        id: imageId,
        name: 'garage.png',
        mime: 'image/png',
        data: new Uint8Array(),
        transcript: 'The garage lights are off.',
      };
      yield {
        id: textId,
        name: 'reading.txt',
        mime: 'text/plain',
        data: Buffer.from('Meter reads zero.'),
        transcript: null,
      };
    },
  });
}

async function coldAttachmentPrompt(
  host: DispatcherFixture,
  attachments: string[],
  parent: Opened,
  model?: string,
): Promise<Prompt> {
  const selection = model === undefined ? {} : { provider: host.route.route_id, model };
  route(host, parent.sessionId, 'finish', selection);
  await host.send(parent, 'delegate');
  const child = await runningChild(host, parent.sessionId);
  await waitForHelperSettlement(host, parent.sessionId, child);
  const epoch = await replaceWriter(host, parent.claim, child);
  return {
    kind: 'prompt',
    author: 'person',
    session_id: child.session_id,
    expected_epoch: epoch,
    delivery_id: randomUUID(),
    text: '',
    attachments,
    helper_parent: {
      session_id: parent.sessionId,
      epoch: parent.claim.epoch,
      start_seq: host.persistence.statSync(child.session_id).next_seq,
      quote: null,
    },
  };
}

async function conflictingPrompt(host: DispatcherFixture, request: Prompt): Promise<void> {
  let settled = false;
  const result = host.dispatcher
    .execute(randomUUID(), { ...request, text: 'Different content' })
    .then(
      () => null,
      (error: unknown) => error,
    )
    .then((value) => {
      settled = true;
      return value;
    });
  await vi.waitFor(() => {
    expect(settled).toBe(true);
  });
  expect(await result).toMatchObject({ code: 'operation_failed' });
}

it('joins concurrent attachment retries before loading copied files and does not wake the parent', async () => {
  const imageId = randomUUID();
  const textId = randomUUID();
  const loaded = vi.fn<(sessionId: string, ids: readonly string[]) => void>();
  const gate = attachmentGate();
  const host = await bootWithCopiedAttachments(imageId, textId, loaded, gate.wait);
  fixture = host;
  expect(host.dispatcher.runtime.manifest().features).toContain('subagent-attachments');
  const request = await coldAttachmentPrompt(host, [imageId, textId], await host.open());
  const childId: string = request.session_id;
  const parentId: string | undefined = request.helper_parent?.session_id;
  const parentRequests = host.model.requests.filter((item) => item.sessionId === parentId);

  const first = host.dispatcher.execute(request.delivery_id, request);
  const retry = host.dispatcher.execute(randomUUID(), request);
  const accepted = Promise.allSettled([first, retry]);
  try {
    await vi.waitFor(() => {
      expect(loaded).toHaveBeenCalledExactlyOnceWith(childId, [imageId, textId]);
    });
    await conflictingPrompt(host, request);
  } finally {
    gate.open();
  }
  const states = (await accepted).map((result) =>
    result.status === 'fulfilled' ? result.value.state : result.status,
  );
  expect(states).toEqual(['accepted', 'accepted']);
  await expect(host.dispatcher.execute(randomUUID(), request)).resolves.toMatchObject({
    state: 'accepted',
  });

  await vi.waitFor(() => {
    const texts = host.model.requests
      .filter((item) => item.sessionId === childId)
      .flatMap((item) => spoken(item.messages).map((part) => part.text));
    expect(texts.join('\n')).toContain('The garage lights are off.');
    expect(texts.join('\n')).toContain('Meter reads zero.');
  });
  expect(loaded).toHaveBeenCalledExactlyOnceWith(childId, [imageId, textId]);
  expect(host.model.requests.filter((item) => item.sessionId === parentId)).toEqual(parentRequests);
});

it('does not queue an attachment after the helper loses its writer during loading', async () => {
  const ids = [randomUUID(), randomUUID()] as const;
  const loaded = vi.fn<(sessionId: string, ids: readonly string[]) => void>();
  const gate = attachmentGate();
  const host = await bootWithCopiedAttachments(ids[0], ids[1], loaded, gate.wait);
  fixture = host;
  const request = await coldAttachmentPrompt(host, [...ids], await host.open());
  const childId: string = request.session_id;
  const startSeq = host.persistence.statSync(childId).next_seq;
  const result = host.dispatcher.execute(request.delivery_id, request);
  try {
    await vi.waitFor(() => {
      expect(loaded).toHaveBeenCalledExactlyOnceWith(childId, ids);
    });
    host.persistence.lose(childId);
  } finally {
    gate.open();
  }
  await expect(result).rejects.toMatchObject({ code: 'ownership_lost' });
  expect(host.persistence.statSync(childId).next_seq).toBe(startSeq);
});

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const VISION_MODEL = 'scripted-vision';

async function openParentWithVisionHelper(imageId: string): Promise<{
  readonly host: DispatcherFixture;
  readonly parent: Opened;
}> {
  const host = await bootDispatcher(undefined, undefined, {
    loadAttachments: async function* (): AsyncIterable<HarnessAttachment> {
      yield await Promise.resolve({
        id: imageId,
        name: 'garage.png',
        mime: 'image/png',
        data: Buffer.from(PNG, 'base64'),
        transcript: 'The garage lights are off.',
      });
    },
  });
  fixture = host;
  const listModels = host.model.listModels.bind(host.model);
  host.model.listModels = async (provider): Promise<readonly LlmModelInfo[]> => [
    ...(await listModels(provider)),
    { provider, id: VISION_MODEL, name: VISION_MODEL },
  ];
  const resolveModel = host.model.resolveModel.bind(host.model);
  host.model.resolveModel = async (provider, model): Promise<LlmResolvedModelInfo> => ({
    ...(await resolveModel(provider, model)),
    inputModalities: model === VISION_MODEL ? ['text', 'image'] : ['text'],
  });

  const parent = await host.open(undefined, [
    {
      type: SUBAGENT_MODEL_POLICY_EVENT,
      seq: 0,
      time: Date.now(),
      data: {
        allowedModels: [
          { provider: host.route.route_id, model: host.route.model },
          { provider: host.route.route_id, model: VISION_MODEL },
        ],
      },
    },
  ]);
  return { host, parent };
}

it('uses the cold helper vision model instead of its text-only parent model for an image', async () => {
  const imageId = randomUUID();
  const { host, parent } = await openParentWithVisionHelper(imageId);
  const request = await coldAttachmentPrompt(host, [imageId], parent, VISION_MODEL);
  const childId: string = request.session_id;
  await expect(host.dispatcher.execute(request.delivery_id, request)).resolves.toMatchObject({
    state: 'accepted',
  });

  await vi.waitFor(() => {
    expect(host.model.requests[0]?.model).toBe(host.route.model);
    expect(
      host.model.requests.some(
        (item) =>
          item.sessionId === childId &&
          item.model === VISION_MODEL &&
          item.messages.some((message) =>
            message.content.some(
              (part) => part.type === 'image' && originalMediaId(part) === imageId,
            ),
          ),
      ),
    ).toBe(true);
  });
});
