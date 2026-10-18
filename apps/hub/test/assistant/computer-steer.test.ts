import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AiChatRow } from '@smarteverything/domain';
import { settleSteered, steerTurn } from '../../src/assistant/engines/computer/steer';
import type { ComputerRunnerDeps, Turn } from '../../src/assistant/engines/computer/ports';
import type { ProviderState } from '../../src/assistant/engines/computer/provider-state';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';

const JOB = '6b6e4f0e-2d6c-4f54-9d3a-0a4a4f5c7d11';
const DEVICE = '3c1d5a52-9a0e-4b0d-8f0b-7f2b1f6d4e90';
const PNG = Buffer.from('iVBORw0KGgo=', 'base64');
let folder = '';

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'steer-'));
  await writeFile(join(folder, 'photo.png'), PNG);
});

afterAll(async () => {
  await rm(folder, { recursive: true });
});

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- partial fake of a large collaborator
function loose<T>(value: object): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- partial fake of a large collaborator
  return Object.assign(Object.create(null), value);
}

interface Rig {
  readonly deps: ComputerRunnerDeps;
  readonly turn: Turn;
  readonly event: StoredEvent;
  readonly chat: AiChatRow;
  readonly state: ProviderState;
  readonly requests: unknown[];
  readonly stateOf: ReturnType<typeof vi.fn>;
  readonly finished: ReturnType<typeof vi.fn>;
  readonly failedMessage: ReturnType<typeof vi.fn>;
}

function rig(
  options: {
    readonly steered?: boolean;
    readonly attachments?: number;
    readonly runtime?: 'claude' | 'codex';
    readonly working?: boolean;
  } = {},
): Rig {
  const requests: unknown[] = [];
  const stateOf = vi.fn();
  const finished = vi.fn();
  const failedMessage = vi.fn();
  const event = loose<StoredEvent>({ id: 'event-2', message_id: 'message-2', text: 'stop that' });
  const chat = loose<AiChatRow>({ id: 'chat-1' });
  const deps = loose<ComputerRunnerDeps>({
    runtime: options.runtime ?? 'claude',
    log: { info: vi.fn() },
    finished,
    store: {
      assistantChat: {
        attachmentsOf: () =>
          Array.from({ length: options.attachments ?? 0 }, () => ({
            name: 'photo.png',
            mime: 'image/png',
            transcript: null,
          })),
      },
    },
    files: { pathOf: () => join(folder, 'photo.png') },
    conversation: { stateOf, failedMessage },
    directory: {
      request: (device: string, request: unknown): Promise<{ steered: boolean }> => {
        requests.push({ device, request });
        return Promise.resolve({ steered: options.steered ?? true });
      },
    },
  });
  const state = loose<ProviderState>({
    read: () => ({
      device_id: DEVICE,
      job_id: JOB,
      state: options.working === false ? 'completed' : 'working',
    }),
  });
  const turn = loose<Turn>({ jobId: JOB, steered: [] });
  return { deps, turn, event, chat, state, requests, stateOf, finished, failedMessage };
}

describe('steering a running Claude turn', () => {
  it('hands the message to the running job as a mid-work message and remembers it', async () => {
    const { deps, turn, event, chat, state, requests, stateOf } = rig();
    expect(await steerTurn(deps, { state, turn, current: () => true, chat }, event)).toBe(true);
    expect(requests).toEqual([
      {
        device: DEVICE,
        request: {
          operation: 'provider_steer',
          job_id: JOB,
          content: [
            { type: 'text', text: 'User message received while you were working: "stop that"' },
          ],
        },
      },
    ]);
    expect(turn.steered).toEqual([event]);
    expect(stateOf).toHaveBeenCalledWith('message-2', 'delivered');
  });

  it('leaves the message to the next turn when the computer cannot take it into the running reply', async () => {
    const { deps, turn, event, chat, state } = rig({ steered: false });
    expect(await steerTurn(deps, { state, turn, current: () => true, chat }, event)).toBe(false);
    expect(turn.steered).toEqual([]);
  });

  it('hands attachments to the running job together with the message', async () => {
    const { deps, turn, event, chat, state, requests } = rig({ attachments: 1 });
    expect(await steerTurn(deps, { state, turn, current: () => true, chat }, event)).toBe(true);
    expect(requests).toMatchObject([
      {
        request: {
          operation: 'provider_steer',
          content: [
            { type: 'text', text: 'User message received while you were working: "stop that"' },
            { type: 'image', media_type: 'image/png', data: PNG.toString('base64') },
          ],
        },
      },
    ]);
    expect(turn.steered).toEqual([event]);
  });

  it('does not steer an idle chat, a finished turn or a Codex chat', async () => {
    const cases = [rig({ working: false }), rig({ runtime: 'codex' })];
    for (const { deps, turn, event, chat, state, requests } of cases) {
      expect(await steerTurn(deps, { state, turn, current: () => true, chat }, event)).toBe(false);
      expect(requests).toEqual([]);
    }
    const { deps, event, chat, state } = rig();
    expect(
      await steerTurn(deps, { state, turn: undefined, current: () => true, chat }, event),
    ).toBe(false);
  });

  it('fails loudly when the reply finished while the message was being handed over', async () => {
    const { deps, turn, event, chat, state } = rig();
    await expect(
      steerTurn(deps, { state, turn, current: () => false, chat }, event),
    ).rejects.toThrow('finished before');
    expect(turn.steered).toEqual([]);
  });
});

describe('settling steered messages', () => {
  it('answers every steered message with the reply text', () => {
    const { deps, turn, event, stateOf, finished } = rig();
    turn.steered.push(event);
    settleSteered(deps, turn, { ok: true, text: 'done' });
    expect(stateOf).toHaveBeenCalledWith('message-2', 'answered');
    expect(finished).toHaveBeenCalledWith(event, 'done', true);
  });

  it('fails every steered message with the reason the reply failed', () => {
    const { deps, turn, event, failedMessage, finished } = rig();
    turn.steered.push(event);
    settleSteered(deps, turn, { ok: false, reason: 'closed', code: 'unknown' });
    expect(failedMessage).toHaveBeenCalledWith('message-2', 'closed', 'unknown');
    expect(finished).toHaveBeenCalledWith(event, 'closed', false);
  });
});
