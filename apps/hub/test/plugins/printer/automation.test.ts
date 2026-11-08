import {
  PLUGIN_MANIFEST,
  pluginNodeKindId,
  pluginSignalSource,
  pluginSignalSpec,
  pluginTriggerKindId,
  signalMatchesMatcher,
  type PluginManifest,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { HubTool, ToolSource } from '../../../src/ai-tools/hub-tool';
import { failure } from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { bindArgs } from '../../../src/automations/plugin-kinds/args';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import {
  PLUGIN_NODE_PREFIX,
  pluginNodeEffects,
} from '../../../src/automations/plugin-kinds/perform';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import { contributionsOf } from '../../../src/plugins/contributions';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import type { PluginTool } from '../../../src/plugins/builtin/contract';
import { printerPlugin } from '../../../src/plugins/builtin/printer';
import {
  printerAutomationTools,
  type AutomationToolPorts,
} from '../../../src/plugins/builtin/printer/automation-tools';
import { PRINTER_AUTOMATION } from '../../../src/plugins/builtin/printer/automation';
import { PRINTER_EVENTS } from '../../../src/plugins/builtin/printer/events';
import {
  JOB_PICKER,
  PRINTER_PICKER,
  jobPicker,
  printerPicker,
} from '../../../src/plugins/builtin/printer/pickers';
import { printerTools } from '../../../src/plugins/builtin/printer/tools';
import { SignalBus } from '../../../src/signals/bus';
import { testRun } from '../../automations-v3/effects/support';
import { trigger } from '../../support/automation-fixture';
import { captureLogs, testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { OPERATION } from '@smarteverything/ipp';
import { DEFAULT_OPERATIONS, FakeIppPrinter } from './fake-ipp-printer';
import { ANNA, JPEG, OWNER, newServiceRig, type ServiceRig } from './service-rig';

const MANIFEST: PluginManifest = PLUGIN_MANIFEST.parse(printerPlugin.manifest);

const AT = '2026-10-18T10:00:00.000Z';

const FIGURE = z.strictObject({
  ok: z.literal(true),
  value: z.strictObject({
    value: z.number(),
    previous: z.number(),
    change: z.number(),
    unit: z.string(),
  }),
});

const OWNER_REF = { kind: 'plugin', id: 'printer' } as const;

const TOOL_NAMES = ['printer', 'printer_action', 'printer_job', 'printer_pause', 'printer_stat'];

const NODE_IDS = ['print', 'test_page', 'job', 'stats', 'identify', 'pause'];

const EXPLICIT_TRIGGERS = [
  'job_finished',
  'supply_low',
  'supply_empty',
  'problem_added',
  'problem_cleared',
];

const AUTO_TRIGGERS = [
  'job_started',
  'alert',
  'supply_replaced',
  'restarted',
  'config_changed',
  'pairing_problem',
  'offline_long',
];

function nodeOf(id: string): (typeof MANIFEST.contributes.automation.nodes)[number] {
  const found = MANIFEST.contributes.automation.nodes.find((node) => node.id === id);
  if (found === undefined) throw new Error(`no node ${id}`);
  return found;
}

describe('the printer automation declaration', () => {
  it('is valid and runs only tools the plugin registers', () => {
    const assembled = expectContributionValid(printerPlugin, { tools: TOOL_NAMES });
    expect(assembled.rejections).toEqual([]);
  });

  it('serves every node and every trigger, explicit or from an event, as a printer kind', () => {
    const catalog = createKindCatalog();
    const synced = syncContribution(catalog, pluginContribution(MANIFEST));
    expect(synced.rejections).toEqual([]);
    for (const id of NODE_IDS) {
      expect(catalog.get(pluginNodeKindId(OWNER_REF, id))).toMatchObject({
        class: 'effect',
        category: 'plugins',
      });
    }
    for (const id of [...EXPLICIT_TRIGGERS, ...AUTO_TRIGGERS]) {
      expect(catalog.get(pluginTriggerKindId(OWNER_REF, id))).toMatchObject({ class: 'trigger' });
    }
    expect(PRINTER_AUTOMATION.nodes.map((node) => node.id)).toEqual(NODE_IDS);
    expect(PRINTER_AUTOMATION.triggers.map((entry) => entry.id)).toEqual(EXPLICIT_TRIGGERS);
  });

  it('gives each entity a picker source and keeps every id unique', () => {
    expect(PRINTER_AUTOMATION.entities.map((entry) => [entry.id, entry.options])).toEqual([
      ['printer', PRINTER_PICKER],
      ['job', JOB_PICKER],
    ]);
    const ids = [...PRINTER_AUTOMATION.nodes, ...PRINTER_AUTOMATION.triggers].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares the job key on the events the print wait and the triggers rely on', () => {
    const fields = (kind: string): Readonly<Record<string, string>> =>
      PRINTER_EVENTS.find((event) => event.kind === kind)?.fields ?? {};
    expect(fields('job_finished')['job']).toBe('string');
    expect(fields('job_started')['job']).toBe('string');
    expect(MANIFEST.contributes.events.map((event) => event.kind)).toEqual(
      PRINTER_EVENTS.map((event) => event.kind),
    );
  });

  it('marks only the pause node owner only and gives every node a timeout', () => {
    expect(nodeOf('pause').access).toBe('owner');
    for (const id of NODE_IDS.filter((entry) => entry !== 'pause')) {
      expect(nodeOf(id).access).toBeUndefined();
    }
    for (const id of NODE_IDS) expect(nodeOf(id).timeout).toBeDefined();
  });

  it('prints from a picture id only, with no file path or url to fill in', () => {
    const print = nodeOf('print');
    expect(print.inputs.map((port) => [port.name, port.type.t])).toEqual([
      ['printer', 'entity'],
      ['picture', 'text'],
      ['copies', 'number'],
      ['sides', 'choice'],
      ['colour', 'choice'],
      ['wait', 'duration'],
    ]);
    expect(
      bindArgs(print.run.args, {
        printer: 'u1',
        picture: 'pic-1',
        copies: 2,
        colour: 'monochrome',
      }),
    ).toEqual({
      action: 'print',
      printer: 'u1',
      source: { kind: 'picture', pictureId: 'pic-1' },
      options: { copies: 2, colorMode: 'monochrome' },
    });
  });

  it('has no invented upper bound on the copies', () => {
    const copies = nodeOf('print').inputs.find((port) => port.name === 'copies');
    expect(copies?.type).toMatchObject({ t: 'number', integer: true, min: 1 });
    expect(copies?.type).not.toHaveProperty('max');
  });

  it('waits for its own job, and only waiting runs give the job', () => {
    const print = nodeOf('print');
    expect(print.until).toMatchObject({
      event: 'job_finished',
      match: { job: { output: 'job' } },
    });
    expect(print.until?.timeout).toEqual({ port: 'wait' });
    expect(print.inputs.find((port) => port.name === 'wait')?.default).toBe(1_800_000);
    expect(print.waitOnly).toEqual(['job']);
    expect(print.outputs.map((port) => [port.name, port.type, port.from])).toEqual([
      ['job', { t: 'entity', of: 'printer.job' }, '/job/key'],
    ]);
    expect(nodeOf('test_page').until).toBeUndefined();
  });

  it('reads the stats as a query that only waits', () => {
    const stats = nodeOf('stats');
    expect(stats.kind).toBe('query');
    expect(stats.outputs.map((port) => port.name)).toEqual(['value', 'previous', 'change', 'unit']);
  });
});

interface Fired {
  readonly signal: SignalInput;
}

let opened: TestStore;
let logs: ReturnType<typeof captureLogs>;

function signalsOf(
  events: readonly Parameters<ReturnType<typeof contributionsOf>['sinks']['event']>[0][],
): Fired[] {
  const fired: Fired[] = [];
  const { sinks } = contributionsOf(
    {
      store: opened.store,
      signals: {
        emit: (signal) => {
          fired.push({ signal });
        },
        register: vi.fn(),
      },
      inbound: vi.fn(),
      now: () => new Date(AT),
    },
    MANIFEST,
    vi.fn(),
  );
  for (const event of events) sinks.event(event);
  return fired;
}

function firesOn(
  kind: string,
  ports: Record<string, string>,
  fired: readonly Fired[],
): readonly (Readonly<Record<string, unknown>> | undefined)[] {
  const catalog = createKindCatalog();
  syncContribution(catalog, pluginContribution(MANIFEST));
  const compiled = compileTriggers('auto-1', [trigger(kind, ports)], (id) => catalog.matcher(id));
  expect(compiled.problems).toEqual([]);
  const [entry] = compiled.signals;
  if (entry === undefined) throw new Error('the trigger did not compile');
  return fired.map(({ signal }) =>
    signalMatchesMatcher(entry.matcher, signal)
      ? signalFire(compiled, signal, entry.triggerId)?.payload
      : undefined,
  );
}

const CONTROL_OPERATIONS = [
  ...DEFAULT_OPERATIONS,
  OPERATION.pausePrinter,
  OPERATION.resumePrinter,
  OPERATION.holdJob,
  OPERATION.releaseJob,
];

const FINISHED = {
  kind: 'job_finished',
  subject: 'Print job completed on Hall',
  data: {
    result: 'completed',
    pages: 3,
    person: 'anna',
    job: 'k-1',
    printer: 'Hall',
    printer_id: 'u1',
  },
} as const;

describe('printer triggers fire on the events the plugin emits', () => {
  beforeEach(async () => {
    logs = captureLogs();
    opened = await testStore();
    opened.store.plugins.create({
      manifest: MANIFEST,
      source: 'builtin',
      location: 'builtin',
      trusted: true,
    });
  });

  afterEach(async () => {
    await opened.close();
  });

  it('fires a job trigger for its printer and result and hands the job on', () => {
    const fired = signalsOf([
      FINISHED,
      { ...FINISHED, data: { ...FINISHED.data, result: 'canceled', job: 'k-2' } },
      { ...FINISHED, data: { ...FINISHED.data, printer_id: 'u2', job: 'k-3' } },
    ]);
    const kind = pluginTriggerKindId(OWNER_REF, 'job_finished');
    expect(firesOn(kind, { printer: 'u1', result: 'completed' }, fired)).toEqual([
      expect.objectContaining({
        printer: 'u1',
        printer_name: 'Hall',
        job: 'k-1',
        result: 'completed',
        pages: 3,
        person: 'anna',
      }),
      undefined,
      undefined,
    ]);
    expect(firesOn(kind, {}, fired).map((payload) => payload !== undefined)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('fires the supply triggers with the supply and its level', () => {
    const fired = signalsOf([
      {
        kind: 'supply_low',
        subject: 'Black is low',
        data: { supply: 'Black', key: 'k', level: 9, printer: 'Hall', printer_id: 'u1' },
      },
      {
        kind: 'supply_empty',
        subject: 'Black is empty',
        data: { supply: 'Black', key: 'k', level: 0, printer: 'Hall', printer_id: 'u1' },
      },
    ]);
    expect(firesOn(pluginTriggerKindId(OWNER_REF, 'supply_low'), { printer: 'u1' }, fired)).toEqual(
      [expect.objectContaining({ supply: 'Black', level: 9, printer: 'u1' }), undefined],
    );
    expect(
      firesOn(pluginTriggerKindId(OWNER_REF, 'supply_empty'), { printer: 'u1' }, fired),
    ).toEqual([undefined, expect.objectContaining({ supply: 'Black', level: 0 })]);
  });

  it('fires the problem triggers and an automatic trigger for an event with no explicit one', () => {
    const fired = signalsOf([
      {
        kind: 'problem_added',
        subject: 'Jam',
        data: {
          keyword: 'jam',
          severity: 'error',
          part: 'rear',
          printer: 'Hall',
          printer_id: 'u1',
        },
      },
      {
        kind: 'problem_cleared',
        subject: 'Jam gone',
        data: { keyword: 'jam', part: 'rear', printer: 'Hall', printer_id: 'u1' },
      },
      { kind: 'restarted', subject: 'Restarted', data: { printer: 'Hall', printer_id: 'u1' } },
    ]);
    expect(
      firesOn(pluginTriggerKindId(OWNER_REF, 'problem_added'), { printer: 'u1' }, fired),
    ).toEqual([
      expect.objectContaining({ keyword: 'jam', severity: 'error', part: 'rear' }),
      undefined,
      undefined,
    ]);
    expect(firesOn(pluginTriggerKindId(OWNER_REF, 'problem_cleared'), {}, fired)).toEqual([
      undefined,
      expect.objectContaining({ keyword: 'jam', part: 'rear' }),
      undefined,
    ]);
    expect(firesOn(pluginTriggerKindId(OWNER_REF, 'restarted'), {}, fired)).toEqual([
      undefined,
      undefined,
      expect.anything(),
    ]);
    expect(logs.events()).not.toContain('plugin_kind.rejected');
  });
});

function hubToolOf(tool: PluginTool): HubTool {
  return {
    name: `printer__${tool.name}`,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    origin: { kind: 'plugin', pluginId: 'printer' },
    humanOnly: tool.humanOnly,
  };
}

let printer: FakeIppPrinter;
let setup: ServiceRig;
let bus: SignalBus;

function toolsOf(ports: AutomationToolPorts): PluginTool[] {
  return [...printerTools(setup.service), ...printerAutomationTools(ports)];
}

function performer(tools: readonly PluginTool[]) {
  const byName = new Map(tools.map((tool) => [`printer__${tool.name}`, tool]));
  const source: ToolSource = {
    tools: () => tools.map(hubToolOf),
    call: (tool, args, caller) => {
      const found = byName.get(tool.name);
      return found === undefined
        ? Promise.resolve(failure(`no tool ${tool.name}`))
        : found.run(args, caller);
    },
    validate: (tool, args) => byName.get(tool.name)?.validate(args) ?? null,
    changes: () => () => undefined,
  };
  const handlers = pluginNodeEffects({
    store: opened.store,
    events: { record: () => undefined },
    clock: { now: () => new Date(AT) },
    signals: bus,
    tools: () => new ToolHub([source]),
  });
  const run = testRun();
  return async (
    kind: string,
    params: Record<string, string | number | boolean>,
    mode?: 'wait_for_result',
  ): Promise<unknown> => {
    const handler = handlers[PLUGIN_NODE_PREFIX];
    if (handler === undefined) throw new Error('no plugin performer');
    return await handler(
      params,
      {
        kind,
        node: { id: 'n', key: 'n' },
        path: 'n',
        activation: '0',
        key: 'n',
        params,
        retry: 'external',
        budget: 'effects',
        ...(mode === undefined ? {} : { mode }),
      },
      run,
    );
  };
}

async function settledOf(work: Promise<unknown>): Promise<boolean> {
  let done = false;
  void work.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let turn = 0; turn < 8; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  return done;
}

function finishedSignal(job: string): SignalInput {
  return {
    source: pluginSignalSource('printer'),
    kind: 'job_finished',
    subject: null,
    field: null,
    value: true,
    previous: null,
    at: AT,
    profileId: null,
    data: { ...FINISHED.data, job },
  };
}

describe('printer nodes against a fake printer', () => {
  let uuid = '';
  let perform: ReturnType<typeof performer>;

  beforeEach(async () => {
    logs = captureLogs();
    opened = await testStore();
    opened.store.plugins.create({
      manifest: MANIFEST,
      source: 'builtin',
      location: 'builtin',
      trusted: true,
    });
    printer = new FakeIppPrinter({ operations: CONTROL_OPERATIONS });
    await printer.start();
    setup = newServiceRig();
    bus = new SignalBus({ log: testLogger('signals') });
    bus.register(pluginSignalSpec(MANIFEST));
    await setup.service.act({ action: 'add', uri: printer.url, name: 'Hall' }, OWNER);
    const [session] = setup.registry.list();
    await session?.poll();
    uuid = printer.state.uuid;
    setup.pictures.set('snap-1', { profile: 'anna', name: 'Picture snap-1', data: JPEG });
    perform = performer(
      toolsOf({ registry: setup.registry, service: setup.service, now: () => new Date(AT) }),
    );
  });

  afterEach(async () => {
    vi.useRealTimers();
    for (const session of setup.registry.list()) session.stop();
    await printer.stop();
    await opened.close();
  });

  function jobKey(): string {
    const [session] = setup.registry.list();
    const [job] = session?.ledger.jobs() ?? [];
    if (job === undefined) throw new Error('the printer has no job');
    return job.key;
  }

  const PRINT = pluginNodeKindId(OWNER_REF, 'print');

  it('prints a picture by its id and hands the job on without waiting in send mode', async () => {
    await expect(perform(PRINT, { printer: uuid, picture: 'snap-1', copies: 2 })).resolves.toEqual({
      ok: true,
      value: { sent: true },
    });
    await vi.waitFor(() => {
      expect(printer.documents).toHaveLength(1);
    });
    expect(Buffer.from(printer.documents[0] ?? [])).toEqual(JPEG);
  });

  it('waits until the printer ends its own job and ignores other jobs', async () => {
    const result = perform(
      PRINT,
      { printer: uuid, picture: 'snap-1', wait: 30 * 60_000 },
      'wait_for_result',
    );
    await vi.waitFor(() => {
      expect(printer.documents).toHaveLength(1);
    });
    const key = jobKey();
    expect(await settledOf(result)).toBe(false);
    bus.emit(finishedSignal('someone-elses-job'));
    expect(await settledOf(result)).toBe(false);
    bus.emit(finishedSignal(key));
    await expect(result).resolves.toEqual({ ok: true, value: { job: key } });
  });

  it('ends on the error exit with Timeout when the job never ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const result = perform(
      PRINT,
      { printer: uuid, picture: 'snap-1', wait: 30 * 60_000 },
      'wait_for_result',
    );
    await vi.waitFor(() => {
      expect(printer.documents).toHaveLength(1);
    });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    await expect(result).resolves.toMatchObject({ ok: false, class: 'Timeout', code: 'timeout' });
  });

  it('fails with a reason when the picture does not exist and prints nothing', async () => {
    const result = await perform(
      PRINT,
      { printer: uuid, picture: 'nope', wait: 30 * 60_000 },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain('picture');
    expect(printer.documents).toEqual([]);
  });

  it('prints a test page', async () => {
    await expect(
      perform(pluginNodeKindId(OWNER_REF, 'test_page'), { printer: uuid }, 'wait_for_result'),
    ).resolves.toEqual({ ok: true, value: {} });
    expect(printer.documents).toHaveLength(1);
  });

  it('cancels a job found by its key alone, whichever printer holds it', async () => {
    await setup.service.act(
      { action: 'print', printer: uuid, source: { kind: 'picture', pictureId: 'snap-1' } },
      OWNER,
    );
    const key = jobKey();
    const result = await perform(
      pluginNodeKindId(OWNER_REF, 'job'),
      { job: key, action: 'cancel' },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: true });
    expect(printer.seen.some((entry) => entry.operation === 0x0008)).toBe(true);
  });

  it('holds and releases a job, and finds the printer by its beep or flash', async () => {
    await setup.service.act(
      { action: 'print', printer: uuid, source: { kind: 'picture', pictureId: 'snap-1' } },
      OWNER,
    );
    const key = jobKey();
    const job = pluginNodeKindId(OWNER_REF, 'job');
    await perform(job, { job: key, action: 'hold' }, 'wait_for_result');
    await perform(job, { job: key, action: 'release' }, 'wait_for_result');
    const seen = printer.seen.map((entry) => entry.operation);
    expect(seen).toContain(OPERATION.holdJob);
    expect(seen).toContain(OPERATION.releaseJob);
    await perform(
      pluginNodeKindId(OWNER_REF, 'identify'),
      { printer: uuid, how: 'flash' },
      'wait_for_result',
    );
    expect(printer.seen.map((entry) => entry.operation)).toContain(OPERATION.identifyPrinter);
  });

  it('says so on the error exit when no printer has the job', async () => {
    const result = await perform(
      pluginNodeKindId(OWNER_REF, 'job'),
      { job: 'nothing', action: 'hold' },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: false, class: 'Forbidden', code: 'not_authorized' });
  });

  it('pauses and resumes the queue with one boolean', async () => {
    const pause = pluginNodeKindId(OWNER_REF, 'pause');
    await perform(pause, { printer: uuid, paused: true }, 'wait_for_result');
    expect(printer.state.reasons).toContain('paused');
    await perform(pause, { printer: uuid, paused: false }, 'wait_for_result');
    expect(printer.state.reasons).not.toContain('paused');
  });

  it('reads a printing figure with the period before and the change', async () => {
    await setup.service.act(
      { action: 'print', printer: uuid, source: { kind: 'picture', pictureId: 'snap-1' } },
      OWNER,
    );
    const result = await perform(
      pluginNodeKindId(OWNER_REF, 'stats'),
      { printer: uuid, period: 'week', metric: 'pages' },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: true, value: { unit: 'pages' } });
    const { value } = FIGURE.parse(result);
    expect(value.change).toBe(value.value - value.previous);
  });

  it('refuses a cost when no prices are set and names a missing printer', async () => {
    const cost = await perform(
      pluginNodeKindId(OWNER_REF, 'stats'),
      { printer: uuid, period: 'month', metric: 'cost' },
      'wait_for_result',
    );
    expect(cost).toMatchObject({ ok: false, code: 'not_authorized' });
    const missing = await perform(
      pluginNodeKindId(OWNER_REF, 'stats'),
      { printer: 'nowhere', period: 'week', metric: 'pages' },
      'wait_for_result',
    );
    expect(missing).toMatchObject({ ok: false, class: 'NotFound', code: 'not_a_printer' });
  });

  it('reads ink used from the supply levels recorded in the period', async () => {
    const [session] = setup.registry.list();
    const key = session?.model?.supplies.find((row) => row.consumed)?.key;
    if (session === undefined || key === undefined) throw new Error('the printer has no supply');
    session.ledger.recordSupply(key, 80, new Date('2026-10-18T08:00:00.000Z'));
    session.ledger.recordSupply(key, 70, new Date('2026-10-18T09:30:00.000Z'));
    const result = await perform(
      pluginNodeKindId(OWNER_REF, 'stats'),
      { printer: uuid, period: 'day', metric: 'ink_used' },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: true, value: { value: 10, unit: '%' } });
  });
});

describe('printer pickers', () => {
  beforeEach(async () => {
    printer = new FakeIppPrinter();
    await printer.start();
    setup = newServiceRig();
    await setup.service.act({ action: 'add', uri: printer.url, name: 'Hall' }, OWNER);
    const [session] = setup.registry.list();
    await session?.poll();
    setup.pictures.set('snap-1', { profile: 'anna', name: 'Picture snap-1', data: JPEG });
  });

  afterEach(async () => {
    for (const session of setup.registry.list()) session.stop();
    await printer.stop();
  });

  it('lists printers by their id and looks up chosen ones', async () => {
    const provider = printerPicker({ registry: setup.registry });
    const uuid = printer.state.uuid;
    await expect(provider({}, OWNER)).resolves.toMatchObject({
      state: 'ready',
      options: [{ id: uuid, label: 'Hall' }],
    });
    await expect(provider({ ids: uuid }, OWNER)).resolves.toMatchObject({
      options: [{ id: uuid }],
    });
    await expect(provider({ q: 'nothing' }, OWNER)).resolves.toMatchObject({ options: [] });
  });

  it('says why when no printer is set up', async () => {
    const provider = printerPicker({ registry: { list: () => [] } });
    const page = await provider({}, OWNER);
    expect(page).toMatchObject({ state: 'unavailable' });
    expect(JSON.stringify(page)).toContain('No printer');
    await expect(jobPicker({ registry: { list: () => [] } })({}, OWNER)).resolves.toMatchObject({
      state: 'unavailable',
    });
  });

  it('lists jobs for the person who owns them and every job for the owner', async () => {
    const uuid = printer.state.uuid;
    await setup.service.act(
      { action: 'print', printer: uuid, source: { kind: 'picture', pictureId: 'snap-1' } },
      ANNA,
    );
    const provider = jobPicker({ registry: setup.registry });
    const mine = await provider({}, ANNA);
    const others = await provider({}, { ...ANNA, profileId: 'ben', role: 'member' });
    const owner = await provider({}, OWNER);
    expect(mine).toMatchObject({ state: 'ready', options: [{ label: 'Picture snap-1' }] });
    expect(others).toMatchObject({ state: 'ready', options: [] });
    expect(JSON.stringify(owner)).toBe(JSON.stringify(mine));
    expect(JSON.stringify(mine)).toContain('Hall');
  });
});
