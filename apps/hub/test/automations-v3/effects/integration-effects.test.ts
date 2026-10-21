import { describe, expect, it } from 'vitest';
import type { SignalInput } from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import type { HubTool, HubToolResult } from '../../../src/ai-tools/hub-tool';
import type { ToolCheck } from '../../../src/ai-tools/tool-hub';
import { AutomationComputersSlot } from '../../../src/automations/automation-computers';
import type { CameraPictures } from '../../../src/automations/effects/camera-pictures';
import { IntegrationError } from '../../../src/automations/effects/integration-error';
import type {
  OneShotAnswer,
  OneShotDecision,
  OneShotRequest,
} from '../../../src/automations/effects/one-shot-model';
import { WebhookReplies } from '../../../src/automations/effects/webhook-replies';
import { performer } from '../../../src/automations/engine-v3-effects';
import { integrationEffects } from '../../../src/automations/integration-effects';
import { testRun } from './support';

const PROFILE = '22222222-2222-4222-8222-222222222222';
const CAMERA = '33333333-3333-4333-8333-333333333333';

const TOOL: HubTool = {
  name: 'x',
  title: 'X',
  description: 'x',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

interface Seen {
  readonly asked: OneShotRequest[];
  readonly taken: { readonly deviceId: string; readonly size: string }[];
  readonly toolCalls: { readonly name: string; readonly args: Record<string, unknown> }[];
  readonly emitted: SignalInput[];
  readonly powered: unknown[];
  readonly replies: WebhookReplies;
}

function rig(
  options: {
    readonly toolAnswer?: Record<string, unknown>;
    readonly snapshot?: () => Promise<{ id: string; at: string }>;
  } = {},
): { perform: (kind: string, params: EffectRequest['params']) => Promise<NodeResult>; seen: Seen } {
  const seen: Seen = {
    asked: [],
    taken: [],
    toolCalls: [],
    emitted: [],
    powered: [],
    replies: new WebhookReplies(),
  };
  const answer: OneShotAnswer = { text: 'hello', result: { a: 1 }, tokens: 7, costUsd: 0.01 };
  const decision: OneShotDecision = { answer: true, reason: 'because', tokens: 3, costUsd: 0.02 };
  const pictures: CameraPictures = {
    take: (deviceId, size) => {
      seen.taken.push({ deviceId, size });
      return (
        options.snapshot?.() ?? Promise.resolve({ id: 'pic-1', at: '2026-10-08T12:00:00.000Z' })
      );
    },
    load: () => Promise.resolve({ mimeType: 'image/jpeg', base64: 'QUJD' }),
  };
  const computers = new AutomationComputersSlot();
  computers.attach({
    ask: (_viewer, _deviceId, request, schema) => {
      seen.powered.push(request);
      return Promise.resolve(schema.parse(null));
    },
    features: () => [],
  });
  const handlers = integrationEffects({
    model: {
      ask: (request) => {
        seen.asked.push(request);
        return Promise.resolve(answer);
      },
      decide: (request) => {
        seen.asked.push({ ...request, shape: null, tools: [] });
        return Promise.resolve(decision);
      },
    },
    pictures,
    computers,
    tools: {
      check: (): ToolCheck => ({ ok: true, tool: TOOL }),
      call: (name, args): Promise<HubToolResult> => {
        seen.toolCalls.push({ name, args });
        return Promise.resolve({
          response: options.toolAnswer ?? { result: { ok: true } },
          line: '',
          pictures: [],
        });
      },
    },
    signals: { emit: (signal): void => void seen.emitted.push(signal) },
    replies: seen.replies,
    clock: { now: (): Date => new Date('2026-10-08T12:00:00.000Z') },
    ownerProfileId: () => PROFILE,
  });
  const run = performer(handlers);
  return {
    seen,
    perform: (kind, params) =>
      run(
        {
          kind,
          node: { id: 'n1', key: 'n1' },
          path: 'n1',
          activation: '0',
          key: 'n1',
          params,
          retry: 'external',
          budget: 'effects',
        },
        testRun(),
      ),
  };
}

describe('AI effects', () => {
  it('asks as the owner by default with no tools and returns the usage', async () => {
    const { perform, seen } = rig();
    const result = await perform('ai.ask', { prompt: 'Hi', images: ['pic-1'], budget: 0.5 });
    expect(result).toMatchObject({
      ok: true,
      value: { text: 'hello', result: { a: 1 }, tokens: 7, cost: 0.01 },
    });
    expect(seen.asked[0]).toMatchObject({
      profileId: PROFILE,
      role: 'owner',
      tools: [],
      capUsd: 0.5,
      pictures: [{ base64: 'QUJD' }],
    });
  });

  it('refuses a bad shape field type before calling the model', async () => {
    const { perform, seen } = rig();
    const result = await perform('ai.ask', { prompt: 'Hi', shape: { mood: 'colour' } });
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(seen.asked).toHaveLength(0);
  });

  it('looks at a new camera picture when no picture is given', async () => {
    const { perform, seen } = rig();
    const result = await perform('ai.vision', { question: 'Who?', camera: { camera: CAMERA } });
    expect(result).toMatchObject({ ok: true, value: { answer: 'hello' } });
    expect(seen.taken).toEqual([{ deviceId: CAMERA, size: 'full' }]);
  });

  it('needs either a picture or a camera for vision', async () => {
    const { perform } = rig();
    expect(await perform('ai.vision', { question: 'Who?' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(
      await perform('ai.vision', { question: 'Who?', image: 'a', camera: CAMERA }),
    ).toMatchObject({ ok: false, class: 'Invalid' });
  });

  it('returns the yes or no with its reason', async () => {
    const { perform, seen } = rig();
    const result = await perform('ai.decide', { question: 'Worth it?', context: 'It is 3am' });
    expect(result).toMatchObject({
      ok: true,
      value: { answer: true, reason: 'because', cost: 0.02 },
    });
    expect(seen.asked[0]?.prompt).toBe('It is 3am\n\nWorth it?');
  });
});

describe('camera and machine effects', () => {
  it('gives back the picture id and time', async () => {
    const { perform } = rig();
    expect(await perform('camera.snapshot', { camera: CAMERA, size: 'thumb' })).toMatchObject({
      ok: true,
      value: { image: 'pic-1', at: '2026-10-08T12:00:00.000Z' },
    });
  });

  it('reports a camera that is switched off as refused', async () => {
    const { perform } = rig({
      snapshot: () => Promise.reject(new IntegrationError('Refused', 'switched off for privacy')),
    });
    expect(await perform('camera.snapshot', { camera: CAMERA })).toMatchObject({
      ok: false,
      class: 'Refused',
    });
  });

  it('powers a computer by its action', async () => {
    const { perform, seen } = rig();
    await perform('computer.power', { computer: 'pc-1', action: 'lock_screen' });
    expect(seen.powered).toEqual([{ verb: 'power', action: 'lock_screen' }]);
    expect(await perform('computer.power', { computer: 'pc-1', action: 'wake' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
  });

  it('asks a phone through the phone action operation', async () => {
    const { perform, seen } = rig();
    await perform('phone.action', { phone: 'ph-1', action: { type: 'set_dnd', on: true } });
    expect(seen.toolCalls[0]).toMatchObject({
      name: 'operation_call',
      args: {
        operation: 'runPhoneAction',
        arguments: { deviceId: 'ph-1', body: { type: 'set_dnd', on: true } },
      },
    });
  });

  it('turns a phone that says no into a refusal', async () => {
    const { perform } = rig({ toolAnswer: { result: { ok: false, detail: 'no permission' } } });
    expect(
      await perform('phone.action', { phone: 'ph-1', action: { type: 'set_dnd', on: true } }),
    ).toMatchObject({ ok: false, class: 'Refused', message: 'no permission' });
  });
});

describe('health, signal and webhook effects', () => {
  it('reads the newest day of a metric', async () => {
    const { perform, seen } = rig({
      toolAnswer: {
        daily: [
          { day: '2026-10-07', metric: 'steps', value: 100, unit: 'count' },
          { day: '2026-10-08', metric: 'steps', value: 4200, unit: 'count' },
        ],
      },
    });
    const result = await perform('health.read', { person: { person: PROFILE }, metric: 'steps' });
    expect(result).toMatchObject({
      ok: true,
      value: { found: true, value: 4200, unit: 'count', day: '2026-10-08' },
    });
    expect(seen.toolCalls[0]?.args).toMatchObject({ metrics: ['steps'], personId: PROFILE });
  });

  it('presses an infrared button through the remote tool', async () => {
    const { perform, seen } = rig({});
    expect(await perform('device.ir_send', { remote: 'TV', button: 'Power' })).toMatchObject({
      ok: true,
    });
    expect(seen.toolCalls[0]).toMatchObject({
      name: 'remote_press',
      args: { remote: 'TV', button: 'Power' },
    });
    expect(await perform('device.ir_send', {})).toMatchObject({ ok: false, class: 'Invalid' });
  });

  it('says when there is no figure', async () => {
    const { perform } = rig({ toolAnswer: { daily: [] } });
    expect(await perform('health.read', { person: PROFILE, metric: 'steps' })).toMatchObject({
      ok: true,
      value: { found: false },
    });
  });

  it('sends a named event with its data', async () => {
    const { perform, seen } = rig();
    await perform('signal.emit', { name: 'guests_arrived', payload: { count: 2 } });
    expect(seen.emitted[0]).toMatchObject({
      source: 'automation_event',
      kind: 'sent',
      field: 'guests_arrived',
      data: { count: 2 },
    });
  });

  it('answers a waiting webhook once', async () => {
    const { perform, seen } = rig();
    const run = testRun();
    const waiting = seen.replies.expect(run.runId);
    const handlers = performer(
      integrationEffects({
        model: {
          ask: () => Promise.reject(new Error('unused')),
          decide: () => Promise.reject(new Error('unused')),
        },
        pictures: {
          take: () => Promise.reject(new Error('unused')),
          load: () => Promise.reject(new Error('unused')),
        },
        computers: new AutomationComputersSlot(),
        tools: {
          check: (): ToolCheck => ({ ok: true, tool: TOOL }),
          call: () => Promise.reject(new Error('unused')),
        },
        signals: { emit: (): void => undefined },
        replies: seen.replies,
        clock: { now: (): Date => new Date() },
        ownerProfileId: () => PROFILE,
      }),
    );
    const request: EffectRequest = {
      kind: 'http.respond',
      node: { id: 'n1', key: 'n1' },
      path: 'n1',
      activation: '0',
      key: 'n1',
      params: { status: 201, body: { ok: true } },
      retry: 'external',
      budget: 'effects',
    };
    expect(await handlers(request, run)).toMatchObject({ ok: true });
    expect(await waiting).toEqual({ status: 201, body: { ok: true }, headers: {} });
    expect(await handlers(request, run)).toMatchObject({ ok: false, class: 'Invalid' });
    expect(await perform('http.respond', {})).toMatchObject({ ok: false, class: 'Invalid' });
  });
});
