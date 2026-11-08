import { randomUUID } from 'node:crypto';
import {
  JSON_VALUE,
  NODE_REGISTRY,
  TRANSCRIPT_HIT,
  TRANSCRIPT_PAGE_LIMIT,
  type TranscriptHit,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { HubTool, HubToolResult, ToolCaller } from '../../../src/ai-tools/hub-tool';
import { SE_TOOLS } from '../../../src/ai-tools/se-tools';
import type { ToolCheck, ToolHub } from '../../../src/ai-tools/tool-hub';
import { AssistantFiles } from '../../../src/assistant/files';
import { withExecutionAuthority } from '../../../src/assistant/turn-authority';
import { conversationEffects } from '../../../src/automations/effects/conversation-nodes';
import { AutomationImagesSlot } from '../../../src/automations/effects/image-nodes';
import { IntegrationError } from '../../../src/automations/effects/integration-error';
import type { CameraPictures } from '../../../src/automations/effects/camera-pictures';
import { VISION_SOURCES, visionPicture } from '../../../src/automations/effects/vision-sight';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import { TEST_ENGINE } from '../../support/engine';
import { FakeClock } from '../../support/fake-clock';
import { testStore, type TestStore } from '../../support/store';
import { testRun } from './support';
import { hubLayout } from '../../../src/data-layout';

const NOW = '2026-10-08T10:00:00.000Z';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const CAMERA = randomUUID();

const SESSION = randomUUID();

interface ToolCall {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly caller: ToolCaller;
}

interface Rig {
  readonly db: TestStore;
  readonly calls: ToolCall[];
  readonly loaded: string[];
  readonly taken: string[];
  readonly handlers: ReturnType<typeof conversationEffects>;
  readonly owner: string;
  readonly pictures: CameraPictures;
  readonly tools: Pick<ToolHub, 'check' | 'call'>;
  readonly respond: (answer: Answer) => void;
}

type Answer = (name: string, args: Readonly<Record<string, unknown>>) => HubToolResult;

const open: TestStore[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

const SCHEMA = z.looseObject({ properties: z.record(z.string(), z.unknown()).default({}) });

const VARIANT = z.looseObject({ inputSchema: SCHEMA });

function allowedKeys(tool: HubTool, args: Readonly<Record<string, unknown>>): readonly string[] {
  const view = args['view'];
  const variant = typeof view === 'string' ? tool.variants?.get(view) : undefined;
  const schema = variant === undefined ? tool.inputSchema : VARIANT.parse(variant).inputSchema;
  return Object.keys(SCHEMA.parse(schema).properties);
}

function checked(name: string, args: Readonly<Record<string, unknown>>): ToolCheck {
  const tool = SE_TOOLS.find((each) => each.name === name);
  if (tool === undefined) return { ok: false, reason: `There is no tool named ${name}` };
  const allowed = allowedKeys(tool, args);
  const stray = Object.keys(args).filter((key) => !allowed.includes(key));
  return stray.length === 0
    ? { ok: true, tool }
    : { ok: false, reason: `${name} does not take ${stray.join(', ')}` };
}

const RESULT = z.record(z.string(), JSON_VALUE);

function done(result: unknown): HubToolResult {
  return {
    response: { result: RESULT.parse(JSON.parse(JSON.stringify(result))) },
    line: '',
    pictures: [],
  };
}

function defaultAnswer(name: string): HubToolResult {
  if (name === 'chat_post') return done({ ok: true, summary: 'Posted', id: 'message-1' });
  if (name === 'listening_edit') return done({ ok: true, summary: 'Changed' });
  return done({});
}

async function rig(): Promise<Rig> {
  const db = await testStore();
  open.push(db);
  const { store } = db;
  const clock = new FakeClock(NOW);
  const calls: ToolCall[] = [];
  const loaded: string[] = [];
  const taken: string[] = [];
  const owner = store.profiles.first().id;
  const files = new AssistantFiles({
    layout: hubLayout(db.directory, {}),
    chat: store.assistantChat,
    now: clock.now,
  });
  const unused = (): never => {
    throw new Error('not used');
  };
  const images = new AutomationImagesSlot();
  images.attach({
    files,
    engine: () => TEST_ENGINE,
    selectedModel: () => null,
    actor: unused,
    service: { start: unused, settled: unused, cancel: unused },
  });
  const pictures: CameraPictures = {
    take: (deviceId) => {
      taken.push(deviceId);
      return Promise.resolve({ id: 'snapshot-1', at: NOW });
    },
    load: (id) => {
      loaded.push(id);
      return Promise.resolve({ mimeType: 'image/jpeg', base64: JPEG.toString('base64') });
    },
  };
  let answer: Answer = (name) => defaultAnswer(name);
  const tools: Pick<ToolHub, 'check' | 'call'> = {
    check: (name, args) => checked(name, args),
    call: (name, args, caller) => {
      calls.push({ name, args, caller });
      return Promise.resolve(answer(name, args));
    },
  };
  return {
    db,
    calls,
    loaded,
    taken,
    owner,
    pictures,
    tools,
    respond: (next): void => {
      answer = next;
    },
    handlers: conversationEffects({
      store,
      integration: { tools, pictures, ownerProfileId: () => owner },
      images,
      clock,
    }),
  };
}

function request(
  kind: string,
  params: EffectRequest['params'],
  mode?: EffectRequest['mode'],
): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'external',
    budget: 'effects_person',
    ...(mode === undefined ? {} : { mode }),
  };
}

function run(
  home: Rig,
  kind: string,
  params: EffectRequest['params'],
  mode?: EffectRequest['mode'],
): Promise<NodeResult> {
  const handler = home.handlers[kind];
  if (handler === undefined) throw new Error(`${kind} has no handler`);
  return handler(params, request(kind, params, mode), testRun());
}

function valueOf(result: NodeResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`failed: ${result.class} ${result.message}`);
  return { ...result.value };
}

function failureOf(result: NodeResult): { readonly class: string; readonly message: string } {
  if (result.ok) throw new Error('expected a failure');
  return { class: result.class, message: result.message };
}

function authority(role: 'owner' | 'member', profileId: string): ConversationAuthority {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    client_id: null,
    kind: 'service',
    role,
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
  };
}

function lastCall(home: Rig): ToolCall {
  const call = home.calls.at(-1);
  if (call === undefined) throw new Error('no tool was called');
  return call;
}

describe('chat.post', () => {
  it('posts into the chat of a person and gives the message id when it waited', async () => {
    const home = await rig();
    const result = await run(
      home,
      'chat.post',
      { person: { person: home.owner }, text: ' Dinner ', notify: false },
      'wait_for_result',
    );
    expect(valueOf(result)).toEqual({ messageId: 'message-1' });
    expect(lastCall(home).name).toBe('chat_post');
    expect(lastCall(home).args).toEqual({
      text: 'Dinner',
      files: [],
      notify: false,
      personId: home.owner,
    });
    expect(lastCall(home).caller).toMatchObject({ role: 'owner', via: 'automation' });
  });

  it('hands the post over and continues without an id when it sends', async () => {
    const home = await rig();
    const result = await run(home, 'chat.post', { text: 'Dinner' });
    expect(valueOf(result)).toEqual({});
    expect(lastCall(home).args).toMatchObject({ personId: home.owner, notify: true });
  });

  it('needs words or a picture', async () => {
    const home = await rig();
    expect(failureOf(await run(home, 'chat.post', { text: '  ' })).class).toBe('Invalid');
    expect(home.calls).toEqual([]);
  });

  it('keeps a camera picture in the chat of the person it goes to', async () => {
    const home = await rig();
    const target = home.db.store.profiles.create({ name: 'Robin' }).id;
    await run(
      home,
      'chat.post',
      { person: target, text: 'Look', picture: 'snapshot-1' },
      'wait_for_result',
    );
    const files = lastCall(home).args['files'];
    const [file] = z.array(z.object({ uploadId: z.string() })).parse(files);
    expect(home.loaded).toEqual(['snapshot-1']);
    expect(file).toBeDefined();
    expect(home.db.store.assistantChat.attachment(file?.uploadId ?? '')).toMatchObject({
      profile_id: target,
      mime: 'image/jpeg',
      bytes: JPEG.length,
    });
  });

  it('refuses a picture that belongs to another person without posting', async () => {
    const home = await rig();
    const target = home.db.store.profiles.create({ name: 'Robin' }).id;
    const files = new AssistantFiles({
      layout: hubLayout(home.db.directory, {}),
      chat: home.db.store.assistantChat,
      now: (): Date => new Date(NOW),
    });
    const theirs = await files.keepBytes({
      authorize: (): void => undefined,
      profileId: home.owner,
      name: 'made.png',
      mime: 'image/png',
      content: JPEG,
      signal: new AbortController().signal,
    });
    const result = failureOf(
      await run(home, 'chat.post', { person: target, picture: theirs.id }, 'wait_for_result'),
    );
    expect(result.class).toBe('Forbidden');
    expect(home.calls).toEqual([]);
  });

  it('lets a member post only to their own chat', async () => {
    const home = await rig();
    const member = home.db.store.profiles.create({ name: 'Robin' }).id;
    const attempt = await withExecutionAuthority(authority('member', member), () =>
      run(home, 'chat.post', { person: home.owner, text: 'Hi' }, 'wait_for_result'),
    );
    expect(failureOf(attempt).class).toBe('Forbidden');
    expect(home.calls).toEqual([]);
    await withExecutionAuthority(authority('member', member), () =>
      run(home, 'chat.post', { text: 'Hi' }, 'wait_for_result'),
    );
    expect(lastCall(home).args['personId']).toBe(member);
    expect(lastCall(home).caller.role).toBe('member');
  });

  it('shows a refusal of the tool as the failure', async () => {
    const home = await rig();
    home.respond(() => ({
      response: { error: 'You can post only to your own chat.' },
      line: '',
      pictures: [],
    }));
    const result = failureOf(await run(home, 'chat.post', { text: 'Hi' }, 'wait_for_result'));
    expect(result.message).toContain('You can post only to your own chat.');
  });
});

interface Said {
  readonly id: number;
  readonly minutesAgo: number;
  readonly speaker: string;
  readonly text: string;
  readonly speakerId?: string;
}

function hit({ id, minutesAgo, speaker, text, speakerId }: Said): TranscriptHit {
  const at = new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString();
  return TRANSCRIPT_HIT.parse({
    session: {
      id: SESSION,
      source: 'camera',
      source_id: CAMERA,
      plugin_id: null,
      title: 'Kitchen',
      retention_days: null,
      started_at: at,
      ended_at: null,
      last_line_at: at,
      line_count: 1,
      participants: [speaker],
    },
    line: {
      id,
      session_id: SESSION,
      at,
      ended_at: null,
      timing: null,
      speaker_id: speakerId ?? null,
      speaker,
      text,
      bot: false,
    },
  });
}

function pagesOf(home: Rig, hits: readonly TranscriptHit[], size: number): void {
  home.respond((_name, args) => {
    const words = args['q'];
    const wanted = typeof words === 'string' ? words : null;
    const matching = hits.filter((each) => wanted === null || each.line.text.includes(wanted));
    const cursor = args['cursor'];
    const end = typeof cursor === 'string' ? Number(cursor) : matching.length;
    const start = Math.max(0, end - size);
    return done({
      result: {
        items: matching.slice(start, end),
        before: start > 0 ? String(start) : null,
        after: null,
      },
    });
  });
}

const CAMERA_SOURCE = JSON.stringify({ kind: 'camera', deviceId: CAMERA });

describe('transcript.read', () => {
  it('reads page after page back to the start of the time asked and gives the lines oldest first', async () => {
    const home = await rig();
    const robin = home.db.store.profiles.create({ name: 'Robin' }).id;
    pagesOf(
      home,
      [
        hit({ id: 1, minutesAgo: 90, speaker: 'Old', text: 'too old' }),
        hit({ id: 2, minutesAgo: 50, speaker: 'Robin', text: 'Dinner is ready', speakerId: robin }),
        hit({ id: 3, minutesAgo: 40, speaker: 'Guest', text: 'Thanks' }),
        hit({ id: 4, minutesAgo: 30, speaker: 'Robin', text: 'Any time', speakerId: robin }),
        hit({ id: 5, minutesAgo: 20, speaker: 'Guest', text: 'Bye' }),
      ],
      2,
    );
    const result = valueOf(
      await run(home, 'transcript.read', { source: CAMERA_SOURCE, last: 60 * 60_000 }),
    );
    expect(result['text']).toBe(
      'Robin: Dinner is ready\nGuest: Thanks\nRobin: Any time\nGuest: Bye',
    );
    expect(result['lines']).toMatchObject([
      { speaker: 'Robin', text: 'Dinner is ready', bot: false },
      { speaker: 'Guest', text: 'Thanks' },
      { speaker: 'Robin', text: 'Any time' },
      { speaker: 'Guest', text: 'Bye' },
    ]);
    expect(result['speakers']).toEqual([{ person: robin }]);
    expect(home.calls.map((call) => call.args['cursor'])).toEqual([undefined, '3', '1']);
    expect(lastCall(home).args).toMatchObject({
      view: 'feed',
      source: 'camera',
      sourceId: CAMERA,
      limit: TRANSCRIPT_PAGE_LIMIT,
    });
  });

  it('stops at the first page when nothing older is needed', async () => {
    const home = await rig();
    pagesOf(
      home,
      [
        hit({ id: 1, minutesAgo: 50, speaker: 'A', text: 'one' }),
        hit({ id: 2, minutesAgo: 10, speaker: 'B', text: 'two' }),
      ],
      5,
    );
    const result = valueOf(
      await run(home, 'transcript.read', { source: CAMERA_SOURCE, last: 20 * 60_000 }),
    );
    expect(result['text']).toBe('B: two');
    expect(home.calls).toHaveLength(1);
  });

  it('gives nothing for a quiet time', async () => {
    const home = await rig();
    pagesOf(home, [], 5);
    const result = valueOf(
      await run(home, 'transcript.read', { source: CAMERA_SOURCE, last: 20 * 60_000 }),
    );
    expect(result).toEqual({ text: '', lines: [], speakers: [] });
  });

  it('searches for words within the time asked', async () => {
    const home = await rig();
    pagesOf(
      home,
      [
        hit({ id: 1, minutesAgo: 30, speaker: 'A', text: 'the washer is done' }),
        hit({ id: 2, minutesAgo: 20, speaker: 'B', text: 'lunch' }),
      ],
      5,
    );
    const result = valueOf(
      await run(home, 'transcript.read', {
        source: CAMERA_SOURCE,
        last: 60 * 60_000,
        search: ' washer ',
      }),
    );
    expect(result['text']).toBe('A: the washer is done');
    expect(lastCall(home).args).toMatchObject({ view: 'search', q: 'washer' });
  });

  it('maps a phone, a computer and a plugin to what the tool takes', async () => {
    const home = await rig();
    pagesOf(home, [], 5);
    const phone = randomUUID();
    const computer = randomUUID();
    const wanted: [Record<string, string>, Record<string, string>][] = [
      [
        { kind: 'phone', deviceId: phone },
        { source: 'phone', sourceId: phone },
      ],
      [
        { kind: 'computer', deviceId: computer },
        { source: 'computer', sourceId: computer },
      ],
      [
        { kind: 'plugin', pluginId: 'discord', sourceId: 'voice-1' },
        { source: 'plugin', sourceId: 'voice-1' },
      ],
    ];
    for (const [source, args] of wanted) {
      await run(home, 'transcript.read', { source: JSON.stringify(source), last: 1000 });
      expect(lastCall(home).args).toMatchObject(args);
    }
  });

  it('refuses a source that is not a place speech is heard', async () => {
    const home = await rig();
    for (const source of [
      JSON.stringify({ kind: 'attachment', chatId: randomUUID() }),
      'not a source',
      '{"kind":"toaster"}',
    ]) {
      const result = failureOf(await run(home, 'transcript.read', { source, last: 1000 }));
      expect(result.class).toBe('Invalid');
    }
    expect(home.calls).toEqual([]);
  });

  it('reads as the member who owns the run and shows the tool’s refusal', async () => {
    const home = await rig();
    const member = home.db.store.profiles.create({ name: 'Robin' }).id;
    home.respond(() => ({
      response: { error: 'Members read only the speech of their own camera.' },
      line: '',
      pictures: [],
    }));
    const result = await withExecutionAuthority(authority('member', member), () =>
      run(home, 'transcript.read', { source: CAMERA_SOURCE, last: 1000 }),
    );
    expect(failureOf(result).message).toContain('Members read only');
    expect(lastCall(home).caller).toMatchObject({ role: 'member', profileId: member });
  });

  it('asks for pages as large as the feed itself allows', () => {
    const feed = SE_TOOLS.find((tool) => tool.name === 'transcript_read')?.variants?.get('feed');
    const limit = z
      .looseObject({
        inputSchema: z.looseObject({
          properties: z.looseObject({ limit: z.looseObject({ maximum: z.number() }) }),
        }),
      })
      .parse(feed).inputSchema.properties.limit.maximum;
    expect(TRANSCRIPT_PAGE_LIMIT).toBe(limit);
  });
});

describe('listening.set', () => {
  it('changes only what was given, as the person who owns the run', async () => {
    const home = await rig();
    const result = await run(
      home,
      'listening.set',
      { source: 'cam-1', wake: true, sensitivity: 'high' },
      'wait_for_result',
    );
    expect(valueOf(result)).toEqual({ ok: true });
    expect(lastCall(home).name).toBe('listening_edit');
    expect(lastCall(home).args).toEqual({ sourceKey: 'cam-1', wake: true, sensitivity: 'high' });
  });

  it('can switch writing down off', async () => {
    const home = await rig();
    await run(home, 'listening.set', { source: 'cam-1', transcribe: false });
    expect(lastCall(home).args).toEqual({ sourceKey: 'cam-1', transcribe: false });
  });

  it('asks what to change when nothing was given', async () => {
    const home = await rig();
    const result = failureOf(await run(home, 'listening.set', { source: 'cam-1' }));
    expect(result.class).toBe('Invalid');
    expect(home.calls).toEqual([]);
  });

  it('refuses a sensitivity the ears do not know', async () => {
    const home = await rig();
    const result = failureOf(
      await run(home, 'listening.set', { source: 'cam-1', sensitivity: 'loud' }),
    );
    expect(result.class).toBe('Invalid');
  });

  it('shows the tool’s refusal when it waited', async () => {
    const home = await rig();
    home.respond(() => ({
      response: { error: 'Members can change only their own phone or computer.' },
      line: '',
      pictures: [],
    }));
    const result = failureOf(
      await run(home, 'listening.set', { source: 'cam-1', wake: false }, 'wait_for_result'),
    );
    expect(result.message).toContain('Members can change only');
  });
});

function sightPicture(): HubToolResult {
  return {
    response: { result: { source: 'desktop_screen', what: 'Desk screen', at: NOW } },
    line: '',
    pictures: [{ data: JPEG, mimeType: 'image/jpeg' }],
  };
}

const WHO = { profileId: randomUUID(), role: 'owner' } as const;

describe('ai.vision sources', () => {
  it('offers the same sources the node declares', () => {
    const declared = NODE_REGISTRY.get('ai.vision')?.inputs.find((port) => port.name === 'source');
    const options =
      declared?.type.t === 'optional' && declared.type.of.t === 'choice'
        ? declared.type.of.options.map((option) => option.id)
        : [];
    expect(options).toEqual([...VISION_SOURCES]);
  });

  it('looks at a picture that was wired in', async () => {
    const home = await rig();
    const picture = await visionPicture(home, { image: 'p-1' }, WHO);
    expect(picture).toEqual({ mimeType: 'image/jpeg', base64: JPEG.toString('base64') });
    expect(home.loaded).toEqual(['p-1']);
    expect(home.taken).toEqual([]);
  });

  it('takes a new picture from a camera, with or without the source picked', async () => {
    const home = await rig();
    await visionPicture(home, { camera: CAMERA }, WHO);
    await visionPicture(home, { source: 'camera', camera: CAMERA }, WHO);
    expect(home.taken).toEqual([CAMERA, CAMERA]);
    expect(home.loaded).toEqual(['snapshot-1', 'snapshot-1']);
    expect(home.calls).toEqual([]);
  });

  it('takes the screen of a computer, a window in front and the screen of a phone', async () => {
    const home = await rig();
    home.respond(() => sightPicture());
    const computer = randomUUID();
    const phone = randomUUID();
    const wanted = [
      [
        { source: 'computer_screen', computer },
        { source: 'desktop_screen', computer },
      ],
      [{ source: 'computer_screen' }, { source: 'desktop_screen' }],
      [
        { source: 'computer_window', computer, window: 'Firefox' },
        { source: 'desktop_window', computer, window: 'Firefox' },
      ],
      [
        { source: 'phone_screen', phone },
        { source: 'phone_screenshot', phone },
      ],
      [{ source: 'phone_screen' }, { source: 'phone_screenshot' }],
    ] as const;
    for (const [look, args] of wanted) {
      const picture = await visionPicture(home, look, WHO);
      expect(picture).toEqual({ mimeType: 'image/jpeg', base64: JPEG.toString('base64') });
      expect(lastCall(home).name).toBe('sight_look');
      expect(lastCall(home).args).toEqual(args);
    }
    expect(lastCall(home).caller).toMatchObject({ profileId: WHO.profileId, role: 'owner' });
    expect(home.taken).toEqual([]);
  });

  it('says what is missing or ambiguous', async () => {
    const home = await rig();
    const asks = [
      {},
      { source: 'camera' },
      { source: 'computer_window' },
      { image: 'p-1', source: 'phone_screen' },
      { image: 'p-1', camera: CAMERA },
    ] as const;
    for (const look of asks) {
      await expect(visionPicture(home, look, WHO)).rejects.toMatchObject({
        name: 'IntegrationError',
        kind: 'Invalid',
      });
    }
    expect(home.calls).toEqual([]);
  });

  it('shows the tool’s refusal and a missing picture as failures', async () => {
    const home = await rig();
    home.respond(() => ({
      response: { error: 'Computer screen sharing is off.' },
      line: '',
      pictures: [],
    }));
    await expect(visionPicture(home, { source: 'computer_screen' }, WHO)).rejects.toThrow(
      'Computer screen sharing is off.',
    );
    home.respond(() => done({ source: 'desktop_screen' }));
    await expect(visionPicture(home, { source: 'computer_screen' }, WHO)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it('checks the arguments against the tool before calling it', async () => {
    const home = await rig();
    const strays = {
      ...home.tools,
      check: (): ToolCheck => ({ ok: false, reason: 'no such thing' }),
    };
    await expect(
      visionPicture({ ...home, tools: strays }, { source: 'phone_screen' }, WHO),
    ).rejects.toThrow('no such thing');
    expect(home.calls).toEqual([]);
  });
});
