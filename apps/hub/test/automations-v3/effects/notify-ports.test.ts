import { randomUUID } from 'node:crypto';
import type { ActionMode, JsonValue } from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { describe, expect, it, vi } from 'vitest';
import type { HubTool, HubToolResult } from '../../../src/ai-tools/hub-tool';
import type { ToolCheck, ToolHub } from '../../../src/ai-tools/tool-hub';
import { AutomationAiSlot } from '../../../src/automations/automation-ai';
import { AutomationComputersSlot } from '../../../src/automations/automation-computers';
import { hubEffectHandlers } from '../../../src/automations/hub-effects';
import { QuestionDesk } from '../../../src/automations/questions/desk';
import { testStore } from '../../support/store';
import { testRun, type TestRun } from './support';

const TOOL: HubTool = {
  name: 'x',
  title: 'The tool',
  description: 'x',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

interface Call {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

async function rig(failing = false): Promise<{
  readonly calls: Call[];
  readonly handlers: ReturnType<typeof hubEffectHandlers>;
  readonly close: () => Promise<void>;
}> {
  const { store, close } = await testStore();
  const calls: Call[] = [];
  const tools: Pick<ToolHub, 'check' | 'call'> = {
    check: (): ToolCheck => ({ ok: true, tool: TOOL }),
    call: (name, args): Promise<HubToolResult> => {
      calls.push({ name, args });
      if (failing) return Promise.reject(new Error('The phone is unreachable'));
      const response =
        name === 'voice_speak'
          ? { result: { result: { target_label: 'Family' } } }
          : { result: {} };
      return Promise.resolve({ response, line: '', pictures: [] });
    },
  };
  const slot = new AutomationAiSlot();
  slot.attach({ wake: () => Promise.resolve(), tools, stop: (): void => undefined });
  const clock = { now: (): Date => new Date('2026-10-25T12:00:00.000Z') };
  const handlers = hubEffectHandlers({
    store,
    clock,
    events: { record: (): void => undefined },
    ai: slot,
    computers: new AutomationComputersSlot(),
    questions: new QuestionDesk({ questions: store.automationQuestions, clock }),
  });
  return { calls, handlers, close };
}

async function run(
  handlers: ReturnType<typeof hubEffectHandlers>,
  kind: string,
  params: Readonly<Record<string, JsonValue>>,
  options: { readonly mode?: ActionMode; readonly run?: TestRun } = {},
): Promise<Awaited<ReturnType<ReturnType<typeof hubEffectHandlers>[string]>>> {
  const handler = handlers[kind];
  if (handler === undefined) throw new Error(`no handler for ${kind}`);
  const request: EffectRequest = {
    kind,
    node: { id: 'n1', key: 'n1' },
    path: 'n1',
    activation: 'a#1',
    key: randomUUID(),
    params,
    retry: 'external',
    budget: 'effects_person',
    mode: options.mode ?? 'wait_for_result',
  };
  return handler(params, request, options.run ?? testRun());
}

describe('notify.person ports', () => {
  it('hands the picture, tag, link and sound to the notification', async () => {
    const { calls, handlers, close } = await rig();
    const person = randomUUID();
    const result = await run(handlers, 'notify.person', {
      people: [person],
      title: 'Door',
      body: 'Open',
      priority: 'high',
      image: 'picture-1',
      tag: 'door',
      link: '/cameras',
      sound: 'chime',
    });
    expect(result.ok).toBe(true);
    expect(calls).toStrictEqual([
      {
        name: 'person_notify',
        args: {
          personId: person,
          text: 'Door\nOpen',
          urgent: false,
          image: 'picture-1',
          tag: 'door',
          link: '/cameras',
          sound: 'chime',
        },
      },
    ]);
    await close();
  });

  it('sends nothing extra when the ports are empty or blank', async () => {
    const { calls, handlers, close } = await rig();
    const person = randomUUID();
    await run(handlers, 'notify.person', {
      people: [person],
      title: 'Door',
      body: '',
      image: null,
      tag: '  ',
    });
    expect(calls[0]?.args).toStrictEqual({ personId: person, text: 'Door', urgent: false });
    await close();
  });
});

describe('notify.speak ports', () => {
  it('speaks to a Talk channel with the priority, volume and voice', async () => {
    const { calls, handlers, close } = await rig();
    const result = await run(handlers, 'notify.speak', {
      channel: 'channel-1',
      text: 'Dinner',
      priority: 'interrupt',
      volume: 40,
      voice: 'nova',
    });
    expect(result).toStrictEqual({ ok: true, value: { ok: true, spokenOn: ['Family'] } });
    expect(calls).toStrictEqual([
      {
        name: 'voice_speak',
        args: {
          target: { kind: 'channel', channelId: 'channel-1' },
          text: 'Dinner',
          priority: 'interrupt',
          volume: 40,
          voice: 'nova',
        },
      },
    ]);
    await close();
  });

  it('leaves the defaults out so the speaker keeps its own behaviour', async () => {
    const { calls, handlers, close } = await rig();
    await run(handlers, 'notify.speak', {
      channel: 'channel-1',
      text: 'Dinner',
      priority: 'queue',
      volume: null,
      voice: null,
    });
    expect(calls[0]?.args).toStrictEqual({
      target: { kind: 'channel', channelId: 'channel-1' },
      text: 'Dinner',
    });
    await close();
  });

  it('refuses a speak step that names neither a device nor a channel', async () => {
    const { calls, handlers, close } = await rig();
    const result = await run(handlers, 'notify.speak', { text: 'Hello' });
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(calls).toStrictEqual([]);
    await close();
  });
});

describe('notify run modes', () => {
  const PERSON_STEP = { title: 'Door', body: 'Open', priority: 'normal' };
  const SPEAK_STEP = { channel: 'channel-1', text: 'Dinner', priority: 'queue' };

  it('waits for the notification and reports who got it', async () => {
    const { handlers, close } = await rig();
    const person = randomUUID();
    const result = await run(handlers, 'notify.person', { ...PERSON_STEP, people: [person] });
    expect(result).toStrictEqual({ ok: true, value: { sent: [{ person }], failed: [] } });
    await close();
  });

  it('turns a failure in wait mode into the error value', async () => {
    const { handlers, close } = await rig(true);
    const result = await run(handlers, 'notify.speak', SPEAK_STEP);
    expect(result).toMatchObject({ ok: false });
    await close();
  });

  it.each([
    ['notify.person', { ...PERSON_STEP, people: ['person-1'] }],
    ['notify.speak', SPEAK_STEP],
    ['notify.feed', { message: 'Door open' }],
  ] as const)('%s in send mode continues at once with no wait-only outputs', async (kind, step) => {
    const { calls, handlers, close } = await rig();
    const result = await run(handlers, kind, step, { mode: 'fire_and_forget' });
    expect(result).toStrictEqual({ ok: true, value: {} });
    expect(calls.length).toBe(kind === 'notify.feed' ? 0 : 1);
    await close();
  });

  it('hands a send-mode failure to the run as a late failure', async () => {
    const { handlers, close } = await rig(true);
    const late = testRun();
    const result = await run(handlers, 'notify.speak', SPEAK_STEP, {
      mode: 'fire_and_forget',
      run: late,
    });
    expect(result).toStrictEqual({ ok: true, value: {} });
    await vi.waitFor(() => {
      expect(late.lateCauses).toHaveLength(1);
    });
    await close();
  });
});
