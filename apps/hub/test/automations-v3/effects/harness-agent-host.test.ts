import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AI_CHAT_ROW,
  AI_USAGE_ROW,
  type AiChatRow,
  type AiUsageRow,
} from '@smarteverything/domain';
import type { InboundTurn } from '../../../src/assistant/requests';
import type { StoredEvent } from '../../../src/store/repositories/assistant-events';
import type { NewChat } from '../../../src/store/repositories/ai-chats';
import {
  HarnessAgentHost,
  type AgentAssistant,
  type AgentHostPorts,
} from '../../../src/automations/effects/harness-agent-host';
import { IntegrationError } from '../../../src/automations/effects/integration-error';

const PROFILE = randomUUID();
const OTHER_CHAT = randomUUID();
const staging: string[] = [];

afterEach(async () => {
  await Promise.all(staging.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

type Finished = Parameters<AgentAssistant['onFinished']>[0];

function eventIn(chatId: string): StoredEvent {
  return {
    cursor: 1,
    id: randomUUID(),
    kind: 'plugin',
    chat_id: chatId,
    message_id: null,
    profile_id: PROFILE,
    client_id: null,
    text: '',
    received_at: '2026-10-25T10:00:00.000Z',
    delivered_at: null,
    answered_at: null,
    report_to: null,
    hops: 0,
  };
}

function rowFor(chatId: string, id: string, extra: Partial<AiUsageRow>): AiUsageRow {
  return AI_USAGE_ROW.parse({
    id,
    at: '2026-10-25T10:00:00.000Z',
    profile_id: PROFILE,
    client_id: null,
    chat_id: chatId,
    message_id: null,
    call_id: null,
    plugin_id: null,
    worker_id: null,
    source: 'openrouter',
    work: 'chat',
    model_id: 'm/x',
    generation_id: null,
    tokens_in: 0,
    tokens_out: 0,
    tokens_cached: 0,
    tokens_reasoning: 0,
    audio_in_ms: 0,
    audio_out_ms: 0,
    images: 0,
    video_ms: 0,
    cost_micros: 0,
    cost_state: 'estimated',
    meta: {},
    ...extra,
  });
}

interface Rig {
  readonly host: HarnessAgentHost;
  readonly created: NewChat[];
  readonly turns: InboundTurn[];
  readonly removed: string[];
  readonly interrupted: string[];
  readonly chat: () => AiChatRow;
  readonly finish: (text: string, ok: boolean, chatId?: string) => void;
  readonly charge: (row: AiUsageRow) => void;
  readonly ask: (chatId: string) => void;
  readonly subscribed: () => { finished: number; ledger: number; interactions: number };
  readonly picturesDuring: string[][];
  readonly tmp: string;
}

interface RigOptions {
  readonly reply?: { readonly text: string; readonly ok: boolean };
  readonly removal?: Error;
}

function rig(options: RigOptions = {}): Rig {
  const created: NewChat[] = [];
  const turns: InboundTurn[] = [];
  const removed: string[] = [];
  const interrupted: string[] = [];
  const picturesDuring: string[][] = [];
  const tmp = join(tmpdir(), `harness-agent-host-${randomUUID()}`, 'tmp');
  staging.push(join(tmp, '..'));
  const finishers = new Set<Finished>();
  const ledgerListeners = new Set<(row: AiUsageRow) => void>();
  const askers = new Set<(chatId: string) => void>();
  let row: AiChatRow | undefined;
  const finish = (text: string, ok: boolean, chatId?: string): void => {
    const target = chatId ?? row?.id ?? OTHER_CHAT;
    for (const listener of finishers) listener(eventIn(target), text, ok);
  };
  const assistant: AgentAssistant = {
    inbound: (turn) => {
      turns.push(turn);
      picturesDuring.push(
        turn.files.flatMap((file) => ('path' in file && existsSync(file.path) ? [file.path] : [])),
      );
      if (options.reply !== undefined) {
        const { text, ok } = options.reply;
        queueMicrotask(() => {
          finish(text, ok);
        });
      }
      return Promise.resolve({ eventId: randomUUID(), messageId: randomUUID() });
    },
    onFinished: (listener) => {
      finishers.add(listener);
      return (): void => {
        finishers.delete(listener);
      };
    },
    interrupt: (_owner, chatId) => {
      interrupted.push(chatId);
      return Promise.resolve();
    },
    removeChat: (_owner, chatId) => {
      removed.push(chatId);
      return options.removal === undefined ? Promise.resolve() : Promise.reject(options.removal);
    },
  };
  const ports: AgentHostPorts = {
    assistant,
    store: {
      aiChats: {
        create: (input) => {
          created.push(input);
          row = AI_CHAT_ROW.parse({
            id: randomUUID(),
            profile_id: input.profileId,
            kind: input.kind,
            title: input.title,
            icon: input.icon,
            parent_id: input.parentId,
            helper_name: input.kind === 'subagent' ? 'Nova' : null,
            source_key: input.sourceKey,
            engine: input.engine,
            tools: input.tools ?? null,
            pinned: false,
            memory: true,
            archived_at: null,
            cost_micros: 0,
            last_message_at: '2026-10-25T10:00:00.000Z',
            created_at: '2026-10-25T10:00:00.000Z',
            updated_at: '2026-10-25T10:00:00.000Z',
          });
          return row;
        },
      },
      aiModels: { row: () => undefined },
      ledger: {
        on: (listener) => {
          ledgerListeners.add(listener);
          return (): void => {
            ledgerListeners.delete(listener);
          };
        },
      },
    },
    tmp,
    interactions: (listener) => {
      askers.add(listener);
      return (): void => {
        askers.delete(listener);
      };
    },
  };
  return {
    host: new HarnessAgentHost(ports),
    created,
    turns,
    removed,
    interrupted,
    picturesDuring,
    tmp,
    chat: (): AiChatRow => {
      if (row === undefined) throw new Error('no chat yet');
      return row;
    },
    finish,
    charge: (charged: AiUsageRow): void => {
      for (const listener of ledgerListeners) listener(charged);
    },
    ask: (chatId: string): void => {
      for (const listener of askers) listener(chatId);
    },
    subscribed: () => ({
      finished: finishers.size,
      ledger: ledgerListeners.size,
      interactions: askers.size,
    }),
  };
}

const LAUNCH = {
  profileId: PROFILE,
  role: 'owner',
  automationId: 'auto-1',
  model: null,
  tools: ['lookup'],
} as const;

describe('the dsh agent host on the hub harness', () => {
  it('opens a hidden-title chat on the metered route with the step tools', () => {
    const { host, created } = rig();
    host.open({ ...LAUNCH, model: 'm/x' });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      profileId: PROFILE,
      kind: 'chat',
      titleAuto: false,
      tools: ['lookup'],
      engine: { kind: 'dsh', execution_target: { kind: 'server' }, model: 'm/x' },
    });
  });

  it('sends the message as an inbound turn and returns the final answer', async () => {
    const { host, turns, chat } = rig({ reply: { text: 'Hello', ok: true } });
    const session = host.open(LAUNCH);
    expect(await session.say({ text: 'Say hi', pictures: [] })).toBe('Hello');
    expect(turns[0]).toMatchObject({
      chat: chat(),
      text: 'Say hi',
      engineText: 'Say hi',
      files: [],
    });
  });

  it('ignores answers that belong to other chats', async () => {
    const { host, finish } = rig();
    const session = host.open(LAUNCH);
    const pending = session.say({ text: 'x', pictures: [] });
    finish('someone else', true, OTHER_CHAT);
    finish('mine', true);
    expect(await pending).toBe('mine');
  });

  it('raises Unreachable when the turn fails', async () => {
    const { host } = rig({ reply: { text: 'route is down', ok: false } });
    const session = host.open(LAUNCH);
    const error = await session.say({ text: 'x', pictures: [] }).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ kind: 'Unreachable' });
  });

  it('refuses when the agent asks for an answer or an approval', async () => {
    const { host, ask, chat, interrupted } = rig();
    const session = host.open(LAUNCH);
    const pending = session.say({ text: 'x', pictures: [] }).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    ask(OTHER_CHAT);
    ask(chat().id);
    expect(await pending).toMatchObject({ kind: 'Refused' });
    expect(interrupted).toEqual([chat().id]);
  });

  it('adds up the tokens and cost of the chat from the ledger', () => {
    const { host, charge, chat } = rig();
    const session = host.open(LAUNCH);
    const seen: number[] = [];
    session.onSpend((spend) => {
      seen.push(spend.costUsd);
    });
    const first = randomUUID();
    charge(rowFor(chat().id, first, { tokens_in: 10, tokens_out: 5, cost_micros: 2_000 }));
    charge(rowFor(chat().id, first, { tokens_in: 12, tokens_out: 6, cost_micros: 3_000 }));
    charge(rowFor(chat().id, randomUUID(), { tokens_in: 1, tokens_out: 1, cost_micros: 1_000 }));
    charge(rowFor(OTHER_CHAT, randomUUID(), { tokens_in: 99, tokens_out: 99, cost_micros: 9_000 }));
    expect(session.spent()).toEqual({ tokens: 20, costUsd: 0.004 });
    expect(seen).toEqual([0.002, 0.003, 0.004]);
  });

  it('stages pictures as files for the turn and removes them afterwards', async () => {
    const { host, turns, picturesDuring, tmp } = rig({ reply: { text: 'a cat', ok: true } });
    const session = host.open(LAUNCH);
    await session.say({ text: 'what', pictures: [{ mimeType: 'image/jpeg', base64: 'QUJD' }] });
    const staged = picturesDuring[0] ?? [];
    expect(staged).toHaveLength(1);
    expect(staged[0]?.startsWith(`${tmp}/`)).toBe(true);
    expect(staged[0]).toMatch(/picture-1\.jpe?g$/u);
    expect(turns[0]?.files.every((file) => 'path' in file && !existsSync(file.path))).toBe(true);
  });

  it('removes the chat and stops listening when it ends', async () => {
    const { host, removed, chat, subscribed } = rig();
    const session = host.open(LAUNCH);
    expect(subscribed()).toEqual({ finished: 1, ledger: 1, interactions: 1 });
    await session.end();
    expect(removed).toEqual([chat().id]);
    expect(subscribed()).toEqual({ finished: 0, ledger: 0, interactions: 0 });
  });

  it('logs and goes on when the chat cannot be removed', async () => {
    const { host, removed } = rig({ removal: new Error('busy') });
    const session = host.open(LAUNCH);
    await expect(session.end()).resolves.toBeUndefined();
    expect(removed).toHaveLength(1);
  });

  it('interrupts through the assistant on request', async () => {
    const { host, interrupted, chat } = rig();
    await host.open(LAUNCH).interrupt();
    expect(interrupted).toEqual([chat().id]);
  });
});
