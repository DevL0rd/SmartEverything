import { randomUUID } from 'node:crypto';
import type { EventInsert } from '../../../src/database/port';
import type { HubTool, HubToolResult } from '../../../src/ai-tools/hub-tool';
import type { ToolCheck, ToolHub } from '../../../src/ai-tools/tool-hub';
import { describe, expect, it } from 'vitest';
import type { AutomationAiSlot } from '../../../src/automations/automation-ai';
import { wakeAssistant } from '../../../src/automations/effects/ai-wake';
import { runDeviceOperation } from '../../../src/automations/effects/device-operation';
import { Notifier } from '../../../src/automations/effects/notify';
import { callTool, ToolActionError } from '../../../src/automations/effects/tool';
import { applyValueChange } from '../../../src/automations/effects/value-ops';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { testStore } from '../../support/store';
import { testRun } from './support';

const ORIGIN = { plugin: null };

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

function hub(
  calls: Call[],
  answer: (call: Call) => Record<string, unknown> = () => ({ result: {} }),
): Pick<ToolHub, 'check' | 'call'> {
  return {
    check: (): ToolCheck => ({ ok: true, tool: TOOL }),
    call: (name, args): Promise<HubToolResult> => {
      const call: Call = { name, args };
      calls.push(call);
      return Promise.resolve({ response: answer(call), line: '', pictures: [] });
    },
  };
}

describe('tool effect', () => {
  it('returns what the tool answered', async () => {
    const calls: Call[] = [];
    const response = await callTool(
      hub(calls, () => ({ result: { n: 1 } })),
      { profileId: randomUUID(), tool: 'voice_speak', args: { a: 1 } },
      ORIGIN,
    );
    expect(response).toStrictEqual({ result: { n: 1 } });
    expect(calls).toStrictEqual([{ name: 'voice_speak', args: { a: 1 } }]);
  });

  it('turns a refused or failed tool into one error', async () => {
    const refusing: Pick<ToolHub, 'check' | 'call'> = {
      check: (): ToolCheck => ({ ok: false, reason: 'no such tool' }),
      call: () => Promise.reject(new Error('unreachable')),
    };
    await expect(
      callTool(refusing, { profileId: randomUUID(), tool: 'x', args: {} }, ORIGIN),
    ).rejects.toBeInstanceOf(ToolActionError);
    await expect(
      callTool(
        hub([], () => ({ error: 'boom' })),
        { profileId: randomUUID(), tool: 'x', args: {} },
        ORIGIN,
      ),
    ).rejects.toThrow('The tool: boom');
  });

  it('runs a device operation through operation_call', async () => {
    const calls: Call[] = [];
    const result = await runDeviceOperation(
      hub(calls, () => ({ result: { pressed: true } })),
      { operation: 'pressDeviceButton', args: { id: 'a' }, profileId: randomUUID() },
      ORIGIN,
    );
    expect(result).toStrictEqual({ pressed: true });
    expect(calls[0]).toStrictEqual({
      name: 'operation_call',
      args: { operation: 'pressDeviceButton', arguments: { id: 'a' } },
    });
  });
});

describe('notify effects', () => {
  interface Notified {
    readonly events: EventInsert[];
    readonly notify: Notifier;
  }

  function notifier(calls: Call[], answer?: (call: Call) => Record<string, unknown>): Notified {
    const events: EventInsert[] = [];
    return {
      events,
      notify: new Notifier({
        events: { record: (event): void => void events.push(event) },
        clock: { now: (): Date => new Date('2026-10-08T12:00:00.000Z') },
        tools: hub(calls, answer),
      }),
    };
  }

  it('writes the activity feed note as the automation run event', () => {
    const { events, notify } = notifier([]);
    const automationId = randomUUID();
    notify.feed({ automationId, name: 'Washer' }, 'Done');
    expect(events).toStrictEqual([
      {
        deviceId: null,
        kind: 'automation_run',
        occurredAt: '2026-10-08T12:00:00.000Z',
        details: { automationId, name: 'Washer', message: 'Done' },
      },
    ]);
  });

  it('notifies each person and reports who could not be reached', async () => {
    const calls: Call[] = [];
    const [first, second] = [randomUUID(), randomUUID()];
    const { notify } = notifier(calls, (call) =>
      call.args['personId'] === second ? { error: 'quiet hours' } : { result: {} },
    );
    const result = await notify.person(
      {
        people: [first, second],
        title: 'Washer',
        body: 'Done',
        priority: 'urgent',
        asProfileId: randomUUID(),
      },
      ORIGIN,
    );
    expect(result).toStrictEqual({ sent: [first], failed: [second] });
    expect(calls.map((call) => call.args)).toStrictEqual([
      { personId: first, text: 'Washer\nDone', urgent: true },
      { personId: second, text: 'Washer\nDone', urgent: true },
    ]);
  });

  it('speaks through the speak tool and names where it was heard', async () => {
    const calls: Call[] = [];
    const { notify } = notifier(calls, () => ({
      result: { result: { target_label: 'Living room camera' } },
    }));
    const deviceId = randomUUID();
    const result = await notify.speak(
      { target: { kind: 'device', deviceId }, text: 'Air is bad', asProfileId: randomUUID() },
      ORIGIN,
    );
    expect(result).toStrictEqual({ ok: true, spokenOn: ['Living room camera'] });
    expect(calls[0]).toStrictEqual({
      name: 'voice_speak',
      args: { target: { kind: 'device', deviceId }, text: 'Air is bad' },
    });
  });
});

describe('assistant wake effect', () => {
  it('hands the instruction to the assistant and stops waiting when cancelled', async () => {
    const woken: unknown[] = [];
    const slot = {
      current: (): ReturnType<AutomationAiSlot['current']> => ({
        wake: (action: unknown): Promise<void> => {
          woken.push(action);
          return new Promise(() => undefined);
        },
        tools: {
          check: (): ToolCheck => ({ ok: false, reason: 'unused' }),
          call: () => Promise.reject(new Error('unused')),
        },
        stop: (): void => undefined,
      }),
    };
    const run = testRun();
    const profileId = randomUUID();
    const waiting = wakeAssistant(
      slot,
      { profileId, chatId: null, instruction: 'Check the oven' },
      { automationId: run.automationId, name: 'Oven', signal: null, plugin: null },
      run,
    );
    await Promise.resolve();
    run.controller.abort();
    await expect(waiting).rejects.toBeInstanceOf(AutomationRunCancelledError);
    expect(woken).toStrictEqual([
      { type: 'wake_ai', profileId, chatId: null, instruction: 'Check the oven' },
    ]);
  });
});

describe('value effect', () => {
  it('applies an operation to a Value and refuses one it does not accept', async () => {
    const { store, close } = await testStore();
    const created = store.automationValues.create({
      kind: 'number',
      name: 'Count',
      value: 1,
      bounds: { overflow: 'reject' },
    });
    expect(
      applyValueChange(store, { valueId: created.id, op: 'add', amount: 2 }).content.value,
    ).toBe(3);
    expect(() =>
      applyValueChange(store, { valueId: created.id, op: 'toggle', amount: undefined }),
    ).toThrow('does not accept toggle');
    await close();
  });
});
