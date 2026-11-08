import {
  CAPABILITY_KEY,
  pluginNodeKindId,
  pluginToolName,
  type CommandRow,
  type DeviceRow,
  type JsonValue,
  type TreadmillActionResult,
  type TreadmillWriteStep,
} from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandOutcome } from '../../../src/database/port';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { createKindCatalog } from '../../../src/automations/plugin-kinds/catalog';
import {
  PLUGIN_NODE_PREFIX,
  pluginNodeEffects,
} from '../../../src/automations/plugin-kinds/perform';
import { actTreadmill } from '../../../src/local/treadmill/acts';
import {
  TREADMILL_AUTOMATION,
  registerTreadmillAutomation,
} from '../../../src/local/treadmill/automation';
import {
  issueThroughHub,
  treadmillAutomationRuntime,
} from '../../../src/local/treadmill/automation-tools';
import { runTreadmillCommand, type CommandDeps } from '../../../src/local/treadmill/commands';
import { NoStepsGuard } from '../../../src/local/treadmill/guard';
import { TreadmillHealth } from '../../../src/local/treadmill/health';
import { treadmillOf } from '../../../src/local/treadmill/known';
import { testRun } from '../../automations-v3/effects/support';
import { captureLogs, testLogger } from '../../support/logs';
import {
  COUNTDOWN,
  IDLE,
  RUNNING,
  statusHex,
  treadmillRig,
  type TreadmillRig,
} from '../../support/treadmill-rig';

const OWNER = { kind: 'driver', id: 'kingsmith_treadmill' } as const;

let rig: TreadmillRig;
let deps: CommandDeps;
let sent: TreadmillWriteStep[][];
let tick: number;

beforeEach(async () => {
  captureLogs();
  rig = await treadmillRig();
  sent = [];
  tick = 0;
  deps = {
    store: rig.test.store,
    fleet: rig.fleet,
    broker: {
      run: (_target, steps): Promise<TreadmillActionResult> => {
        sent.push([...steps]);
        return Promise.resolve({ ok: true, detail: 'Done.' });
      },
    },
    guard: new NoStepsGuard(),
    holderOf: (): string | null => rig.holder.clientId,
    walkerOf: (): string => rig.owner.profile.id,
    holderName: (): string => 'Owner phone',
    now: rig.clock.now,
    log: testLogger('treadmill'),
  };
  rig.batch(tick, [statusHex({ state: IDLE })]);
});

afterEach(async () => {
  await rig.close();
});

async function allowRemoteStart(): Promise<void> {
  await actTreadmill(
    {
      store: rig.test.store,
      fleet: rig.fleet,
      local: { observe: () => Promise.resolve() },
      bridges: { takeOver: () => Promise.reject(new Error('unused')) },
      health: new TreadmillHealth(rig.test.store),
      broker: deps.broker,
      holderOf: deps.holderOf,
      now: rig.clock.now,
      log: testLogger('treadmill'),
    },
    rig.row(),
    {
      clientId: rig.owner.client.id,
      role: 'owner',
      profileId: rig.owner.profile.id,
      client: rig.owner.client,
      phone: true,
    },
    { action: 'configure', settings: { policy: { remoteStart: true } } },
  );
}

function beltRuns(): void {
  tick += 1;
  rig.batch(tick, [statusHex({ state: COUNTDOWN })]);
  tick += 1;
  rig.batch(tick, [statusHex({ state: RUNNING, speed10: 30, time: 1, steps: 0 })]);
}

function issued(device: DeviceRow, control: string, value: JsonValue): Promise<JsonValue> {
  const [row] = rig.test.store.commands.insert([
    { deviceId: device.id, capability: control, value, source: 'automation', requestedBy: null },
  ]);
  if (row === undefined) throw new Error('the command was not stored');
  const result = runTreadmillCommand(deps, {
    commandId: row.id,
    externalId: device.external_id,
    capability: CAPABILITY_KEY.parse(control),
    value,
  });
  if (control === 'belt_command' && value === 'start') beltRuns();
  return result;
}

function perform(params: Record<string, string | number>): Promise<unknown> {
  const catalog = createKindCatalog();
  registerTreadmillAutomation(
    catalog,
    treadmillAutomationRuntime({
      find: (deviceId) => treadmillOf(rig.test.store, deviceId),
      issue: issued,
    }),
  );
  const handlers = pluginNodeEffects({
    store: rig.test.store,
    events: { record: (): void => undefined },
    clock: { now: (): Date => new Date('2026-10-25T10:00:00.000Z') },
    signals: { subscribe: (): (() => void) => () => undefined },
    tools: () => catalog.driverNodes.over(() => new ToolHub([])),
    drivers: catalog.driverNodes,
  });
  const handler = handlers[PLUGIN_NODE_PREFIX];
  if (handler === undefined) throw new Error('no plugin performer');
  const request: EffectRequest = {
    kind: pluginNodeKindId(OWNER, 'start'),
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'external',
    budget: 'effects',
    mode: 'wait_for_result',
  };
  return handler(params, request, testRun());
}

describe('the Start the treadmill node in a run', () => {
  it('has a handler: it starts the belt on the treadmill once remote start is allowed', async () => {
    await allowRemoteStart();
    const result = await perform({ treadmill: rig.device.id });
    expect(result).toEqual({ ok: true, value: {} });
    expect(sent).toHaveLength(1);
  });

  it('sets the goal first, starts the belt, then sets the speed', async () => {
    await allowRemoteStart();
    const result = await perform({
      treadmill: rig.device.id,
      goal: 'distance',
      goalValue: 2000,
      speed: 3.5,
    });
    expect(result).toEqual({ ok: true, value: {} });
    expect(sent).toHaveLength(4);
  });

  it('is refused with the real reason while remote start is off, and sends nothing', async () => {
    const result = await perform({ treadmill: rig.device.id });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain('remote');
    expect(sent).toHaveLength(0);
  });

  it('reports a treadmill that was removed after the automation was written', async () => {
    expect(await perform({ treadmill: 'gone-treadmill' })).toMatchObject({
      ok: false,
      code: 'treadmill_not_found',
    });
    expect(sent).toHaveLength(0);
  });

  it('refuses a speed outside the belt range before asking the treadmill', async () => {
    await allowRemoteStart();
    expect(await perform({ treadmill: rig.device.id, speed: 99 })).toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
  });
});

describe('the treadmill runtime registration', () => {
  it('declares the tool of every node the treadmill offers and drops it when the driver stops', () => {
    const catalog = createKindCatalog();
    const stop = registerTreadmillAutomation(
      catalog,
      treadmillAutomationRuntime({ find: () => null, issue: issued }),
    );
    const nodes = (TREADMILL_AUTOMATION.automation.nodes ?? []).map((node) => node.run.tool);
    expect(nodes).toEqual(['start']);
    expect(catalog.driverNodes.declaration(pluginNodeKindId(OWNER, 'start'))).toBeDefined();
    const tools = catalog.driverNodes.over(() => new ToolHub([]));
    expect(tools.check(pluginToolName(OWNER.id, 'start'), { device: 'x' }).ok).toBe(true);
    stop();
    expect(catalog.driverNodes.declaration(pluginNodeKindId(OWNER, 'start'))).toBeUndefined();
  });
});

describe('issuing a treadmill control through the hub', () => {
  function hubIssue(
    answer: (row: CommandRow) => CommandOutcome,
  ): ReturnType<typeof issueThroughHub> {
    return issueThroughHub({
      store: rig.test.store,
      submit: (commands) => {
        const rows = rig.test.store.commands.insert(commands);
        for (const row of rows) {
          queueMicrotask(() => {
            rig.test.store.commands.finish(row.id, answer(row));
          });
        }
        return rows;
      },
    });
  }

  it('waits for the command to finish and gives its result', async () => {
    const issue = hubIssue(() => ({ status: 'succeeded', result: 'Started' }));
    expect(await issue(rig.row(), 'belt_command', 'start')).toBe('Started');
    const [row] = rig.test.store.commands.recent(1);
    expect(row).toMatchObject({ source: 'automation', requested_by: null });
  });

  it('fails with the reason the treadmill gave', async () => {
    const issue = hubIssue(() => ({ status: 'failed', error: 'owner only' }));
    await expect(issue(rig.row(), 'belt_command', 'start')).rejects.toThrow('owner only');
  });

  it('fails with a reason of its own when the command expired', async () => {
    const issue = hubIssue(() => ({ status: 'expired' }));
    await expect(issue(rig.row(), 'belt_command', 'start')).rejects.toThrow('expired');
  });
});
