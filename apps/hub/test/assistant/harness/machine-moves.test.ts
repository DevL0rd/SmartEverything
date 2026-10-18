import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@smarteverything/domain';
import type {
  AiChatRow,
  HarnessRuntimeReceipt,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import type { NativeCompletion } from '../../../src/assistant/engines/dsh/completion';
import {
  TurnMachineMoves,
  type MovableTurn,
  type MovableTurns,
} from '../../../src/assistant/engines/dsh/machine-moves';
import { acknowledge, useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

interface Recorded {
  readonly steps: string[];
  readonly completions: NativeCompletion[];
  readonly aliases: string[];
}

function turns(recorded: Recorded): MovableTurns<MovableTurn> {
  return {
    hold: (): void => {
      recorded.steps.push('hold');
    },
    release: (): void => {
      recorded.steps.push('release');
    },
    continueAs: (_turn, id): void => {
      recorded.steps.push('continue');
      recorded.aliases.push(id);
    },
    complete: (_turn, event): void => {
      recorded.steps.push('complete');
      recorded.completions.push(event);
    },
  };
}

async function runningOnHub(): Promise<{ chat: AiChatRow; turn: MovableTurn }> {
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), open);
  const current = rig.opened.store.aiChats.chat(chat.id);
  return { chat: current, turn: { chat: current } };
}

function promptsOn(host: { readonly requests: HarnessRuntimeRequest[] }): HarnessRuntimeRequest[] {
  return host.requests.filter((request) => request.kind === 'prompt');
}

async function settled(recorded: Recorded, until: string): Promise<void> {
  await vi.waitFor(() => {
    expect(recorded.steps).toContain(until);
  });
}

describe('moving the chat to another machine at the AI’s tool call', () => {
  it('moves, then has the new machine carry on the same reply with the machine-change note', async () => {
    const { chat, turn } = await runningOnHub();
    rig.opened.store.aiChats.setPendingTarget(chat.id, rig.desk.target);
    const recorded: Recorded = { steps: [], completions: [], aliases: [] };
    const moves = new TurnMachineMoves(rig.service, turns(recorded));

    moves.atToolCall(turn);
    await settled(recorded, 'continue');
    await vi.waitFor(() => {
      expect(promptsOn(rig.desk)).toHaveLength(1);
    });

    expect(recorded.steps).toStrictEqual(['hold', 'continue']);
    const [prompt] = promptsOn(rig.desk);
    expect(prompt).toMatchObject({
      kind: 'prompt',
      delivery_id: recorded.aliases[0],
      text: 'Machine changed: you are now running on Desk (Linux), folder /home/test. Previous machine: Hub. Continue the work you were doing.',
    });
    expect(rig.opened.store.aiChats.chat(chat.id).pending_execution_target).toBeNull();
  });

  it('does nothing when no move waits', async () => {
    const { turn } = await runningOnHub();
    const recorded: Recorded = { steps: [], completions: [], aliases: [] };
    const moves = new TurnMachineMoves(rig.service, turns(recorded));
    rig.calls.length = 0;

    moves.atToolCall(turn);
    await Promise.resolve();

    expect(recorded.steps).toStrictEqual([]);
    expect(rig.calls).toStrictEqual([]);
  });

  it('carries on from the old machine, told the change failed, when the new one cannot open', async () => {
    const { chat, turn } = await runningOnHub();
    rig.opened.store.aiChats.setPendingTarget(chat.id, rig.desk.target);
    rig.desk.script = (request): HarnessRuntimeReceipt => {
      if (request.kind === 'open') throw new ApiError('conflict', 'Cannot open.');
      return acknowledge(request);
    };
    const recorded: Recorded = { steps: [], completions: [], aliases: [] };
    const moves = new TurnMachineMoves(rig.service, turns(recorded));

    moves.atToolCall(turn);
    await settled(recorded, 'continue');
    await vi.waitFor(() => {
      expect(promptsOn(rig.hub)).toHaveLength(1);
    });

    expect(promptsOn(rig.hub)[0]).toMatchObject({
      text: 'Machine change to Desk failed (Cannot open.). You are still running on Hub (Linux). Continue the work you were doing.',
    });
    expect(recorded.completions).toStrictEqual([]);
  });

  it('ends the turn with a failure when neither machine can be reached', async () => {
    const { chat, turn } = await runningOnHub();
    rig.opened.store.aiChats.setPendingTarget(chat.id, rig.desk.target);
    rig.desk.script = (request): HarnessRuntimeReceipt => {
      if (request.kind === 'open') throw new ApiError('conflict', 'Cannot open.');
      return acknowledge(request);
    };
    let opens = 0;
    rig.hub.script = (request): HarnessRuntimeReceipt | undefined => {
      if (request.kind !== 'open') return undefined;
      opens += 1;
      throw new ApiError('conflict', 'Hub is busy.');
    };
    const recorded: Recorded = { steps: [], completions: [], aliases: [] };
    const moves = new TurnMachineMoves(rig.service, turns(recorded));

    moves.atToolCall(turn);
    await settled(recorded, 'complete');

    expect(opens).toBe(1);
    expect(recorded.completions).toMatchObject([{ kind: 'failed' }]);
    expect(recorded.completions[0]).toMatchObject({ failure: { message: 'Cannot open.' } });
  });

  it('ignores further tool calls while a move is under way', async () => {
    const { chat, turn } = await runningOnHub();
    rig.opened.store.aiChats.setPendingTarget(chat.id, rig.desk.target);
    const recorded: Recorded = { steps: [], completions: [], aliases: [] };
    const moves = new TurnMachineMoves(rig.service, turns(recorded));

    moves.atToolCall(turn);
    moves.atToolCall(turn);
    await settled(recorded, 'continue');

    expect(recorded.steps.filter((step) => step === 'hold')).toHaveLength(1);
  });

  it('applies a move that waited when the turn ends, and tells the new machine', async () => {
    const { chat } = await runningOnHub();
    rig.opened.store.aiChats.setPendingTarget(chat.id, rig.desk.target);
    const recorded: Recorded = { steps: [], completions: [], aliases: [] };
    const moves = new TurnMachineMoves(rig.service, turns(recorded));
    rig.calls.length = 0;

    await moves.atTurnEnd(chat.id);

    expect(rig.calls).toStrictEqual(['hub:close', 'desk:open', 'desk:note']);
  });
});
