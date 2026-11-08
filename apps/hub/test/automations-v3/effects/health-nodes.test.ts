import { randomUUID } from 'node:crypto';
import { NODE_REGISTRY, waterEntryOf, type HealthEntryRow } from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubTool, HubToolResult, ToolCaller } from '../../../src/ai-tools/hub-tool';
import type { ToolCheck } from '../../../src/ai-tools/tool-hub';
import { withExecutionAuthority } from '../../../src/assistant/turn-authority';
import { healthEffects } from '../../../src/automations/effects/health-nodes';
import { NUTRITION_TOOLS } from '../../../src/extensions/mcp/tools/nutrition';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import { testStore, type TestStore } from '../../support/store';
import { testRun } from './support';

const NOW = '2026-10-18T12:00:00.000Z';

const GLASS_ML = 200;

const TOOL: HubTool = {
  name: 'log_water',
  title: 'Log water',
  description: 'x',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

const REAL_INPUT = NUTRITION_TOOLS.find((tool) => tool.name === 'log_water')?.input;

interface Call {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly caller: ToolCaller;
}

interface Rig {
  readonly store: TestStore['store'];
  readonly owner: string;
  readonly ann: string;
  readonly calls: Call[];
  readonly offset: { seconds: number };
  readonly reply: { error: string | null };
  readonly run: (params: EffectRequest['params']) => Promise<NodeResult>;
}

const open: TestStore[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((test) => test.close()));
});

function request(params: EffectRequest['params']): EffectRequest {
  return {
    kind: 'health.log_water',
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'relative',
    budget: 'effects',
  };
}

function authority(profileId: string, role: 'owner' | 'member'): ConversationAuthority {
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

function millilitresIn(args: Readonly<Record<string, unknown>>): number {
  if (typeof args['millilitres'] === 'number') return args['millilitres'];
  return typeof args['glasses'] === 'number' ? args['glasses'] * GLASS_ML : 0;
}

async function rig(): Promise<Rig> {
  const test = await testStore(() => new Date(NOW));
  open.push(test);
  const { store } = test;
  const owner = store.profiles.first().id;
  const ann = store.profiles.create({ name: 'Ann' }).id;
  const calls: Call[] = [];
  const offset = { seconds: 0 };
  const reply: { error: string | null } = { error: null };
  const handlers = healthEffects({
    store,
    clock: { now: () => new Date(NOW) },
    integration: {
      ownerProfileId: () => owner,
      tools: {
        check: (_name, args): ToolCheck =>
          REAL_INPUT?.safeParse(args).success === true
            ? { ok: true, tool: TOOL }
            : { ok: false, reason: 'the arguments do not fit log_water' },
        call: (name, args, caller): Promise<HubToolResult> => {
          calls.push({ name, args, caller });
          if (reply.error !== null)
            return Promise.resolve({ response: { error: reply.error }, line: '', pictures: [] });
          const personId = args['personId'];
          const entry: HealthEntryRow = store.healthEntries.create(
            typeof personId === 'string' ? personId : caller.profileId,
            waterEntryOf(millilitresIn(args), {
              startTime: NOW,
              endTime: '2026-10-18T12:01:00.000Z',
              zoneOffsetSeconds: offset.seconds,
            }),
          );
          return Promise.resolve({ response: { entry }, line: '', pictures: [] });
        },
      },
    },
  });
  const handler = handlers['health.log_water'];
  if (handler === undefined) throw new Error('health.log_water has no handler');
  return {
    store,
    owner,
    ann,
    calls,
    offset,
    reply,
    run: (params) => handler(params, request(params), testRun()),
  };
}

function entriesOf(rigged: Rig, profileId: string): number {
  return rigged.store.healthEntries.window(profileId, {
    from: '2026-10-17T00:00:00.000Z',
    to: '2026-10-20T00:00:00.000Z',
  }).length;
}

let home: Rig;

beforeEach(async () => {
  home = await rig();
});

describe('registration', () => {
  it('handles exactly the registered health effect kind', () => {
    const handlers = healthEffects({
      store: home.store,
      clock: { now: () => new Date(NOW) },
      integration: {
        ownerProfileId: () => home.owner,
        tools: {
          check: () => ({ ok: false, reason: 'x' }),
          call: () => Promise.reject(new Error('x')),
        },
      },
    });
    const effects = NODE_REGISTRY.kinds
      .filter(
        (kind) =>
          kind.id.startsWith('health.') && kind.class === 'effect' && kind.id !== 'health.read',
      )
      .map((kind) => kind.id);
    expect(Object.keys(handlers)).toEqual(effects);
  });
});

describe('health.log_water', () => {
  it('logs the drink once through the log_water tool and returns the added and total millilitres', async () => {
    const result = await home.run({ amount: 250 });
    expect(result).toMatchObject({ ok: true, value: { added: 250, total: 250 } });
    expect(home.calls).toHaveLength(1);
    expect(home.calls[0]).toMatchObject({
      name: 'log_water',
      args: { millilitres: 250 },
      caller: { profileId: home.owner, via: 'automation' },
    });
    expect(entriesOf(home, home.owner)).toBe(1);
  });

  it('adds to what was already drunk today', async () => {
    await home.run({ amount: 250, unit: 'millilitres' });
    expect(await home.run({ amount: 330 })).toMatchObject({
      ok: true,
      value: { added: 330, total: 580 },
    });
    expect(entriesOf(home, home.owner)).toBe(2);
  });

  it('logs glasses as glasses and reports the millilitres the tool recorded', async () => {
    const result = await home.run({ amount: 1.5, unit: 'glasses' });
    expect(result).toMatchObject({ ok: true, value: { added: 300, total: 300 } });
    expect(home.calls[0]?.args).toEqual({ glasses: 1.5 });
  });

  it('logs for the named person and totals that person only', async () => {
    const result = await home.run({ person: { person: home.ann }, amount: 400 });
    expect(result).toMatchObject({ ok: true, value: { added: 400, total: 400 } });
    expect(home.calls[0]?.args).toEqual({ millilitres: 400, personId: home.ann });
    expect(entriesOf(home, home.ann)).toBe(1);
    expect(entriesOf(home, home.owner)).toBe(0);
    expect(await home.run({ amount: 100 })).toMatchObject({ value: { total: 100 } });
  });

  it('totals the day at home, which can be a day ahead of UTC', async () => {
    home.store.settings.updateHome({ time_zone: 'Pacific/Auckland' });
    home.offset.seconds = 13 * 3600;
    expect(await home.run({ amount: 500 })).toMatchObject({ ok: true, value: { total: 500 } });
  });

  it('logs as the member who owns the automation and refuses to log for someone else', async () => {
    const own = await withExecutionAuthority(authority(home.ann, 'member'), () =>
      home.run({ amount: 200 }),
    );
    expect(own).toMatchObject({ ok: true, value: { total: 200 } });
    expect(home.calls[0]?.caller.profileId).toBe(home.ann);
    const other = await withExecutionAuthority(authority(home.ann, 'member'), () =>
      home.run({ person: { person: home.owner }, amount: 200 }),
    );
    expect(other).toMatchObject({ ok: false, class: 'Forbidden' });
    expect(home.calls).toHaveLength(1);
    const asOwner = await withExecutionAuthority(authority(home.owner, 'owner'), () =>
      home.run({ person: { person: home.ann }, amount: 200 }),
    );
    expect(asOwner).toMatchObject({ ok: true, value: { total: 400 } });
  });

  it('refuses inputs that are not an amount of water before calling the tool', async () => {
    for (const params of [{}, { amount: 0 }, { amount: -5 }, { amount: 250, unit: 'pints' }])
      expect(await home.run(params), JSON.stringify(params)).toMatchObject({
        ok: false,
        class: 'Invalid',
      });
    expect(home.calls).toHaveLength(0);
  });

  it('reports a tool that fails as a failure and writes nothing', async () => {
    home.reply.error = 'Only an owner may act for another person or app.';
    const result = await home.run({ amount: 250 });
    expect(result).toMatchObject({ ok: false, class: 'Failed' });
    expect(result.ok ? '' : result.message).toContain('Only an owner may act');
    expect(entriesOf(home, home.owner)).toBe(0);
  });
});
