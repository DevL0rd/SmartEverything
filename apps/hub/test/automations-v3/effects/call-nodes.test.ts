import { randomUUID } from 'node:crypto';
import {
  CALL_PERSON,
  NODE_REGISTRY,
  START_CONVERSATION,
  type AiOutreachRow,
  type OutreachState,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import type { HubTool, HubToolResult } from '../../../src/ai-tools/hub-tool';
import type { ToolCheck, ToolHub } from '../../../src/ai-tools/tool-hub';
import { AutomationAiSlot } from '../../../src/automations/automation-ai';
import { callEffects } from '../../../src/automations/effects/call-nodes';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { testStore, type TestStore } from '../../support/store';
import { testRun } from './support';

const TOOL: HubTool = {
  name: 'x',
  title: 'Start a voice call',
  description: 'x',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  origin: { kind: 'se' },
  humanOnly: false,
};

interface Call {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

interface Rig {
  readonly db: TestStore;
  readonly calls: Call[];
  readonly handlers: ReturnType<typeof callEffects>;
  readonly person: string;
  readonly ring: () => AiOutreachRow;
  readonly refuse: (reason: string) => void;
  readonly startAs: (state: OutreachState) => void;
}

interface Behaviour {
  refusal: string | null;
  state: OutreachState;
}

const open: TestStore[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

async function rig(): Promise<Rig> {
  const db = await testStore();
  open.push(db);
  const { store } = db;
  const owner = store.profiles.first();
  const calls: Call[] = [];
  const behaviour: Behaviour = { refusal: null, state: 'ringing' };
  const created = (): AiOutreachRow =>
    store.aiOutreach.add({
      profile_id: owner.id,
      chat_id: null,
      from_chat_id: null,
      how: 'phone',
      target: owner.id,
      target_label: owner.name,
      reason: 'The washer is done',
      urgent: false,
      state: behaviour.state,
      detail: behaviour.state === 'failed' ? 'No app of theirs is connected.' : null,
      expires_at: null,
    });
  const tools: Pick<ToolHub, 'check' | 'call'> = {
    check: (): ToolCheck => ({ ok: true, tool: TOOL }),
    call: (name, args): Promise<HubToolResult> => {
      calls.push({ name, args });
      const response =
        behaviour.refusal === null
          ? name === 'call_start'
            ? { result: { ok: true, summary: 'Called', id: created().id, state: behaviour.state } }
            : { result: { ok: true, summary: 'Ended call' } }
          : { error: behaviour.refusal };
      return Promise.resolve({ response, line: '', pictures: [] });
    },
  };
  const ai = new AutomationAiSlot();
  ai.attach({ wake: () => Promise.resolve(), tools, stop: (): void => undefined });
  return {
    db,
    calls,
    handlers: callEffects({ store, ai }),
    person: owner.id,
    ring: (): AiOutreachRow => {
      const [row] = store.aiOutreach.recent(owner.id, 1);
      if (row === undefined) throw new Error('no call was made');
      return row;
    },
    refuse: (reason): void => {
      behaviour.refusal = reason;
    },
    startAs: (state): void => {
      behaviour.state = state;
    },
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

async function run(
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

async function ringingWait(
  home: Rig,
  params: EffectRequest['params'],
): Promise<{
  readonly result: Promise<NodeResult>;
  readonly row: AiOutreachRow;
  readonly controller: AbortController;
}> {
  const handler = home.handlers['call.person'];
  if (handler === undefined) throw new Error('missing handler');
  const context = testRun();
  const result = handler(params, request('call.person', params, 'wait_for_result'), context);
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  return { result, row: home.ring(), controller: context.controller };
}

describe('call node registration', () => {
  it('has a handler for exactly the call kinds and every one is a registered effect', async () => {
    const home = await rig();
    expect(Object.keys(home.handlers).sort()).toEqual(['call.end', 'call.open', 'call.person']);
    for (const kind of Object.keys(home.handlers)) {
      expect(NODE_REGISTRY.get(kind)?.class, kind).toBe('effect');
    }
  });
});

describe('call.person', () => {
  const baseline = (person: string): EffectRequest['params'] => ({
    person: { person },
    device: 'phone',
    reason: 'The washer is done',
    urgent: true,
  });

  it('rings through call_start with a body the reach endpoint accepts', async () => {
    const home = await rig();
    const pending = await ringingWait(home, baseline(home.person));
    home.db.store.aiOutreach.step(pending.row.id, { state: 'live' });
    await pending.result;
    const [call] = home.calls;
    expect(call?.name).toBe('call_start');
    const { action, ...body } = call?.args ?? {};
    expect(action).toBe('ring');
    expect(CALL_PERSON.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      personId: home.person,
      device: 'phone',
      reason: 'The washer is done',
      urgent: true,
    });
  });

  it('waits while it rings and reports answered when the call goes live', async () => {
    const home = await rig();
    const pending = await ringingWait(home, baseline(home.person));
    let settled = false;
    void pending.result.then(() => {
      settled = true;
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(settled).toBe(false);
    home.db.store.aiOutreach.step(pending.row.id, { state: 'live' });
    expect(valueOf(await pending.result)).toEqual({
      outreachId: pending.row.id,
      answered: true,
      outcome: 'answered',
      timedOut: false,
    });
  });

  it.each([
    ['declined', 'declined'],
    ['missed', 'missed'],
    ['ended', 'cancelled'],
  ] as const)('reports a call that ended as %s as not answered (%s)', async (state, outcome) => {
    const home = await rig();
    const pending = await ringingWait(home, baseline(home.person));
    home.db.store.aiOutreach.step(pending.row.id, { state, detail: 'x' });
    expect(valueOf(await pending.result)).toEqual({
      outreachId: pending.row.id,
      answered: false,
      outcome,
      timedOut: state === 'missed',
    });
  });

  it('flags only a ring that ran out as timed out', async () => {
    const outcomes: Record<string, unknown> = {};
    for (const state of ['live', 'declined', 'missed'] as const) {
      const home = await rig();
      const pending = await ringingWait(home, baseline(home.person));
      home.db.store.aiOutreach.step(pending.row.id, { state });
      outcomes[state] = valueOf(await pending.result)['timedOut'];
    }
    expect(outcomes).toEqual({ live: false, declined: false, missed: true });
  });

  it('reports a call answered and then ended as answered', async () => {
    const home = await rig();
    const pending = await ringingWait(home, baseline(home.person));
    home.db.store.aiOutreach.step(pending.row.id, { state: 'live' });
    home.db.store.aiOutreach.step(pending.row.id, { state: 'ended' });
    expect(valueOf(await pending.result)).toMatchObject({ answered: true, outcome: 'answered' });
  });

  it('sends by choice: it returns the call id as soon as it rings and does not report an outcome', async () => {
    const home = await rig();
    const result = valueOf(
      await run(home, 'call.person', baseline(home.person), 'fire_and_forget'),
    );
    expect(result).toEqual({ outreachId: home.ring().id });
    expect(home.ring().state).toBe('ringing');
  });

  it('fails with Unreachable when no app could be rung, in either mode', async () => {
    for (const mode of ['fire_and_forget', 'wait_for_result'] as const) {
      const home = await rig();
      home.startAs('failed');
      const failure = failureOf(await run(home, 'call.person', baseline(home.person), mode));
      expect(failure).toEqual({
        class: 'Unreachable',
        message: 'No app of theirs is connected.',
      });
    }
  });

  it('fails with Unreachable when the line fails while it waits', async () => {
    const home = await rig();
    const pending = await ringingWait(home, baseline(home.person));
    home.db.store.aiOutreach.step(pending.row.id, {
      state: 'failed',
      detail: 'The server stopped while it was ringing.',
    });
    expect(failureOf(await pending.result)).toEqual({
      class: 'Unreachable',
      message: 'The server stopped while it was ringing.',
    });
  });

  it('turns a refusal of the reach service (quiet hours) into the error exit value', async () => {
    const home = await rig();
    home.refuse('Ana is in quiet hours.');
    const failure = failureOf(await run(home, 'call.person', baseline(home.person)));
    expect(failure.class).toBe('Failed');
    expect(failure.message).toContain('Ana is in quiet hours.');
  });

  it('rejects a run without a reason as Invalid before calling anything', async () => {
    const home = await rig();
    const failure = failureOf(await run(home, 'call.person', { person: home.person, reason: '' }));
    expect(failure.class).toBe('Invalid');
    expect(home.calls).toEqual([]);
  });

  it('stops waiting and listening when the run is cancelled', async () => {
    const home = await rig();
    const pending = await ringingWait(home, baseline(home.person));
    expect(home.db.store.feed.drain().listeners['row']).toBe(1);
    pending.controller.abort();
    await expect(pending.result).rejects.toBeInstanceOf(AutomationRunCancelledError);
    expect(home.db.store.feed.drain().listeners['row']).toBe(0);
  });
});

describe('call.open', () => {
  const reason = 'Tell me what you see';

  it('talks through a camera with a body the conversation endpoint accepts', async () => {
    const home = await rig();
    home.startAs('live');
    const camera = randomUUID();
    const result = valueOf(await run(home, 'call.open', { device: { device: camera }, reason }));
    expect(result).toEqual({ outreachId: home.ring().id });
    const [call] = home.calls;
    const { action, ...body } = call?.args ?? {};
    expect(call?.name).toBe('call_start');
    expect(action).toBe('open');
    expect(START_CONVERSATION.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      target: { kind: 'device', deviceId: camera },
      reason,
      urgent: false,
    });
  });

  it('talks on a Talk channel and does not wait for the conversation to end', async () => {
    const home = await rig();
    home.startAs('live');
    const channelId = randomUUID();
    await run(home, 'call.open', { channel: channelId, reason, urgent: true }, 'fire_and_forget');
    const [call] = home.calls;
    const { action, ...body } = call?.args ?? {};
    expect(action).toBe('open');
    expect(START_CONVERSATION.safeParse(body).success).toBe(true);
    expect(body).toEqual({ target: { kind: 'channel', channelId }, reason, urgent: true });
    expect(home.ring().state).toBe('live');
  });

  it('refuses a device and a channel together, or neither, before calling anything', async () => {
    const home = await rig();
    const both = failureOf(
      await run(home, 'call.open', { device: randomUUID(), channel: randomUUID(), reason }),
    );
    const neither = failureOf(await run(home, 'call.open', { reason }));
    expect([both.class, neither.class]).toEqual(['Invalid', 'Invalid']);
    expect(home.calls).toEqual([]);
  });

  it('fails when the conversation could not start', async () => {
    const home = await rig();
    home.startAs('failed');
    const failure = failureOf(await run(home, 'call.open', { device: randomUUID(), reason }));
    expect(failure.class).toBe('Unreachable');
  });
});

describe('call.end', () => {
  it('hangs up by id through call_end', async () => {
    const home = await rig();
    const outreachId = randomUUID();
    expect(valueOf(await run(home, 'call.end', { outreachId }))).toEqual({ ok: true });
    expect(home.calls).toEqual([{ name: 'call_end', args: { outreachId } }]);
  });

  it('turns a refusal (already finished) into the error exit value', async () => {
    const home = await rig();
    home.refuse('This has already finished.');
    const failure = failureOf(await run(home, 'call.end', { outreachId: randomUUID() }));
    expect(failure.class).toBe('Failed');
    expect(failure.message).toContain('This has already finished.');
  });

  it('refuses a missing id as Invalid before calling anything', async () => {
    const home = await rig();
    expect(failureOf(await run(home, 'call.end', {})).class).toBe('Invalid');
    expect(home.calls).toEqual([]);
  });
});
