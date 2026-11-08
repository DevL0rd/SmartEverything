import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRegistry } from '@deepseek-ai/dsh-agent';
import { AI_REFERENCE_SEARCH } from '@smarteverything/domain';
import type { HarnessNativeFrame } from '@smarteverything/domain';
import type { HarnessRuntimeReceipt } from '@smarteverything/domain';
import { spoken } from './support/runtime';
import { bootDispatcher } from './support/dispatcher';
import type { DispatcherFixture } from './support/dispatcher';
import {
  TASK,
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

function workOf(frames: readonly HarnessNativeFrame[]): readonly string[] {
  return frames.flatMap((frame) =>
    frame.kind === 'status' ? frame.work.map((entry) => entry.reason) : [],
  );
}

const WAITING = 'A subagent of this session has not settled.';

it('returns command and reference receipts for the admitted ordinary chat epoch', async () => {
  fixture = await bootDispatcher();
  const { sessionId, claim } = await fixture.open();
  const session = { session_id: sessionId, expected_epoch: claim.epoch };
  const commands = await fixture.dispatcher.execute(randomUUID(), {
    ...session,
    kind: 'command_list',
  });
  const references = await fixture.dispatcher.execute(randomUUID(), {
    ...session,
    kind: 'reference',
    input: {
      action: 'search',
      search: AI_REFERENCE_SEARCH.parse({ kinds: ['device_path'], query: 'fixture' }),
    },
  });
  expect(commands).toMatchObject({ epoch: claim.epoch, state: 'completed' });
  expect(commands.commands).toBeInstanceOf(Array);
  expect(references).toMatchObject({ epoch: claim.epoch, state: 'completed' });
  expect(references.references?.items).toBeInstanceOf(Array);
});

describe('a native child started by the model', () => {
  it('publishes its own running state and accepts the matching child interrupt', async () => {
    const host = await bootDispatcher();
    fixture = host;
    const parent = await host.open();
    route(host, parent.sessionId, 'hang');
    await host.send(parent, 'delegate');

    const child = await runningChild(host, parent.sessionId);
    expect(host.dispatcher.hasSession(child.session_id, child.epoch)).toBe(true);
    await expect(
      host.dispatcher.execute(randomUUID(), {
        kind: 'close',
        session_id: child.session_id,
        expected_epoch: child.epoch,
      }),
    ).rejects.toThrow('requires a directly opened native chat');
    expect(host.dispatcher.hasSession(child.session_id, child.epoch)).toBe(true);
    await host.dispatcher.execute(randomUUID(), {
      kind: 'interrupt',
      session_id: child.session_id,
      expected_epoch: child.epoch,
    });

    await vi.waitFor(() => {
      const latest = host.published.findLast(
        (event) => event.kind === 'state' && event.session_id === child.session_id,
      );
      expect(latest).toMatchObject({ session: { state: 'idle' } });
    });
  });

  it('stops the child on ownership loss only at the matching writer epoch', async () => {
    let agents: AgentRegistry | undefined;
    const host = await bootDispatcher(undefined, (ctx) => {
      agents = ctx.get('agents');
      return Promise.resolve();
    });
    fixture = host;
    const parent = await host.open();
    route(host, parent.sessionId, 'hang');
    await host.send(parent, 'delegate');
    const child = await runningChild(host, parent.sessionId);
    const agent = agents?.list().find((row) => String(row.id) === child.session_id);
    if (agent === undefined) throw new Error('The automatic child has no running agent.');

    await host.dispatcher.loseSession(child.session_id, child.epoch + 1);
    expect(host.dispatcher.hasSession(child.session_id, child.epoch)).toBe(true);
    expect(agent.status).toBe('running');

    await host.dispatcher.loseSession(child.session_id, child.epoch);
    expect(host.dispatcher.hasSession(child.session_id, child.epoch)).toBe(false);
    expect(agent.status).toBe('idle');
  });

  it('keeps the parent from looking settled while the child works', async () => {
    fixture = await bootDispatcher();
    const parent = await fixture.open();
    route(fixture, parent.sessionId, 'hang');

    await fixture.send(parent, 'delegate');

    await vi.waitFor(() => {
      expect(workOf(fixture?.frames ?? [])).toContain(WAITING);
    });
  });

  it('releases its live child when the parent closes so a reopened parent owns it again', async () => {
    let agents: AgentRegistry | undefined;
    fixture = await bootDispatcher(undefined, (ctx) => {
      agents = ctx.get('agents');
      return Promise.resolve();
    });
    const { model } = fixture;
    model.guard = (options): void => {
      const own = spoken(options.messages).map((message) => message.text);
      if (own.some((text) => text.startsWith(TASK))) model.script({ kind: 'hang' });
      else if (own.some((text) => text.startsWith('started subagent')))
        model.script({ kind: 'text', text: 'delegated' });
      else
        model.script({
          kind: 'tool',
          id: 'd1',
          name: 'subagent',
          input: { description: 'garage', prompt: TASK },
        });
    };
    const parent = await fixture.open();
    await fixture.send(parent, 'delegate');
    await vi.waitFor(() => {
      expect(agents?.list()).toHaveLength(2);
    }, 3_000);

    await fixture.control(parent, 'close');

    expect(agents?.list()).toHaveLength(0);
  });

  it('stops reporting the child as work once it has settled', async () => {
    fixture = await bootDispatcher();
    const parent = await fixture.open();
    route(fixture, parent.sessionId, 'finish');

    await fixture.send(parent, 'delegate');

    await vi.waitFor(() => {
      const statuses = (fixture?.frames ?? []).filter((frame) => frame.kind === 'status');
      expect(statuses.length).toBeGreaterThan(2);
      expect(statuses.at(-1)?.work.map((entry) => entry.reason)).not.toContain(WAITING);
    });
  });
});

it.each(['retained', 'replaced'] as const)(
  'continues a settled helper with a %s writer without asking the parent model',
  async (writer) => {
    const host = await bootDispatcher();
    fixture = host;
    const parent = await host.open();
    const parentId: string = parent.sessionId;
    route(host, parent.sessionId, 'finish');
    await host.send(parent, 'delegate');
    const child = await runningChild(host, parent.sessionId);
    const childId: string = child.session_id;
    await waitForHelperSettlement(host, parentId, child);
    const parentCalls = host.model.requests.filter(
      (request) => request.sessionId === parentId,
    ).length;

    const epoch =
      writer === 'replaced' ? await replaceWriter(host, parent.claim, child) : child.epoch;
    const id = randomUUID();
    const request = {
      kind: 'prompt',
      author: 'person',
      session_id: child.session_id,
      expected_epoch: epoch,
      delivery_id: id,
      text: 'Check again.',
      attachments: [],
      helper_parent: {
        session_id: parent.sessionId,
        epoch: parent.claim.epoch,
        start_seq: host.persistence.statSync(child.session_id).next_seq,
        quote: 'Lights are off.',
      },
    } as const;
    const submit = (): Promise<HarnessRuntimeReceipt> =>
      host.dispatcher.execute(id, { ...request, attachments: [] });
    const receipt = await submit();
    expect(receipt).toMatchObject({
      state: 'accepted',
      session_id: child.session_id,
      epoch,
    });
    await expect(submit()).resolves.toEqual(receipt);

    await vi.waitFor(() => {
      const childClosures = host.frames.filter(
        (frame) => frame.kind === 'close' && frame.session_id === child.session_id,
      );
      expect(childClosures).toHaveLength(2);
      expect(host.published).toContainEqual(
        expect.objectContaining({
          kind: 'completed',
          session_id: child.session_id,
          delivery_id: id,
          interrupted: false,
        }),
      );
    });
    expect(host.model.requests.filter((entry) => entry.sessionId === parentId)).toHaveLength(
      parentCalls,
    );
    expect(
      host.model.requests.some(
        (entry) =>
          entry.sessionId === childId &&
          spoken(entry.messages).some(({ text }) =>
            text.includes('Lights are off.\n\nCheck again.'),
          ),
      ),
    ).toBe(true);
  },
);
