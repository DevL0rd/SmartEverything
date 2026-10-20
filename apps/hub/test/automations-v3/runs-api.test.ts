import { randomUUID } from 'node:crypto';
import {
  AUTOMATION_RUN_ENDPOINTS as E,
  ApiError,
  RUN_RECORD_STATUS,
  type AutomationRunRehearsal,
  type AutomationRunSummary,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Submission } from '../../src/automations/driver/admission';
import { StoreContext, StoreNotFoundError } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { AutomationDecisionsRepository } from '../../src/store/repositories/automation-decisions';
import { AutomationRunNodesRepository } from '../../src/store/repositories/automation-run-nodes';
import type { RunNodeActivation } from '../../src/store/repositories/automation-run-nodes';
import { AutomationRunRecordsRepository } from '../../src/store/repositories/automation-run-records';
import { AutomationTestsRepository } from '../../src/store/repositories/automation-tests';
import { Sql } from '../../src/store/sql';
import type { Caller } from '../../src/server/auth';
import {
  automationRunRoutes,
  type RehearsalRequest,
  type RunOutputs,
} from '../../src/server/handlers/automation-runs';
import { captureLogs, testLogger } from '../support/logs';
import { automationOf, logLine, programRig, type ProgramRig } from './support/program-rig';

const HASH = 'b'.repeat(64);
const NOW = new Date('2026-10-18T09:00:00.000Z');
const START = '2026-10-19T08:00:00.000Z';
const SCENARIO = { start: START };

let rig: ProgramRig;
let records: AutomationRunRecordsRepository;
let nodes: AutomationRunNodesRepository;
let decisions: AutomationDecisionsRepository;
let tests: AutomationTestsRepository;
let sent: RehearsalRequest[];
let cancelled: string[];
let outcome: AutomationRunRehearsal;
let outputs: RunOutputs;
let refusal: ApiError | null;
let member: Caller;
let routes: ReturnType<typeof automationRunRoutes>;

function rehearsalOf(extra: Partial<AutomationRunRehearsal> = {}): AutomationRunRehearsal {
  return {
    outcome: 'succeeded',
    error: null,
    now: START,
    steps: 2,
    run: null,
    nodes: [],
    commands: [],
    paused: [],
    outputs: { level: 3 },
    ...extra,
  };
}

beforeEach(() => {
  captureLogs();
  rig = programRig();
  const context = new StoreContext(
    new Sql(rig.database),
    new ChangeFeed(testLogger('store')),
    () => NOW,
  );
  records = new AutomationRunRecordsRepository(context, () => undefined);
  nodes = new AutomationRunNodesRepository(context);
  decisions = new AutomationDecisionsRepository(context);
  tests = new AutomationTestsRepository(context);
  member = {
    kind: 'client',
    client: rig.member.client,
    profileId: rig.store.profiles.create({ name: 'Robin' }).id,
  };
  sent = [];
  cancelled = [];
  outcome = rehearsalOf();
  outputs = null;
  refusal = null;
  routes = automationRunRoutes({
    store: rig.store,
    programs: rig.programs,
    records,
    nodes,
    decisions,
    tests,
    engine: {
      start: (automationId): Submission => {
        if (refusal !== null) return { kind: 'refused', reason: 'single_busy', error: refusal };
        return { kind: 'started', runId: runOf(automationId).id };
      },
      cancel: (runId): boolean => {
        cancelled.push(runId);
        records.update(runId, { status: 'cancelled' });
        return true;
      },
      cancelAutomation: (automationId, _reason, key): number => {
        const active = records
          .active(automationId)
          .filter((run) => key === undefined || run.control_key === key);
        for (const run of active) cancelled.push(run.id);
        return active.length;
      },
      finished: (runId): Promise<RunOutputs> => {
        records.update(runId, { status: 'succeeded', finished_at: NOW.toISOString() });
        return Promise.resolve(outputs);
      },
    },
    rehearsals: {
      run: (request): Promise<AutomationRunRehearsal> => {
        sent.push(request);
        return Promise.resolve(outcome);
      },
    },
  });
});

afterEach(() => {
  rig.close();
});

function programOf(caller: Caller = rig.owner.caller): string {
  const made = rig.service.create(caller, {
    name: `Lamp ${randomUUID().slice(0, 4)}`,
    enabled: true,
    definition: automationOf([logLine('say', 'hi')]),
  });
  if (made.id === null) throw new Error(made.summary);
  return made.id;
}

function runOf(automationId: string, key: string | null = null): AutomationRunSummary {
  const row = records.create({
    automationId,
    revision: 1,
    ownerProfileId: null,
    controlKey: key,
    mode: 'live',
    planHash: HASH,
    status: 'running',
  });
  return records.summaryById(row.id);
}

function activation(path: string, nodeId: string, iteration: number): RunNodeActivation {
  return {
    path,
    nodeId,
    iteration,
    status: 'succeeded',
    startedAt: NOW.toISOString(),
    finishedAt: NOW.toISOString(),
    durationMs: 1,
    input: null,
    output: { value: { value: iteration, type: { t: 'any' } } },
    error: null,
    commandIds: [],
    late: false,
  };
}

async function call<R extends z.ZodType>(
  shape: { readonly response: R },
  caller: Caller,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<z.output<R>> {
  const route = Object.values(routes).find((entry) => Object.is(entry.endpoint, shape));
  if (route === undefined) throw new Error('The endpoint is not bound.');
  const result = await route.run(
    caller,
    { params: {}, query: {}, body: undefined, remote: 'test', ...raw },
    testLogger(),
  );
  return shape.response.parse(result);
}

async function refused(work: Promise<unknown>): Promise<ApiError> {
  try {
    await work;
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('The call was not refused.');
}

describe('starting a live run', () => {
  it('starts, replies with the summary only and never the run state', async () => {
    const id = programOf();
    const reply = await call(E.startProgramRun, rig.owner.caller, { body: { automationId: id } });
    expect(reply).toMatchObject({
      ok: true,
      mode: 'live',
      status: 'started',
      run: { automation_id: id, status: 'running' },
      outputs: null,
      rehearsal: null,
    });
    expect(Object.keys(reply.run ?? {})).not.toContain('state');
  });

  it('waits for the run and returns the program outputs', async () => {
    const id = programOf();
    outputs = { level: 7 };
    const reply = await call(E.startProgramRun, rig.owner.caller, {
      body: { automationId: id, wait: true },
    });
    expect(reply).toMatchObject({
      ok: true,
      status: 'finished',
      outputs: { level: 7 },
      run: { status: 'succeeded' },
    });
  });

  it('passes an admission refusal on as its error', async () => {
    const id = programOf();
    refusal = new ApiError('conflict', 'busy');
    expect(
      (await refused(call(E.startProgramRun, rig.owner.caller, { body: { automationId: id } })))
        .code,
    ).toBe('conflict');
  });

  it('refuses a scenario, overrides or breakpoints on a live run', async () => {
    const id = programOf();
    const error = await refused(
      call(E.startProgramRun, rig.owner.caller, {
        body: { automationId: id, scenario: SCENARIO, breakpoints: ['n1'] },
      }),
    );
    expect(error.message).toContain('a scenario or breakpoints');
  });

  it('does not find an unknown automation', async () => {
    const error = await refused(
      call(E.startProgramRun, rig.owner.caller, { body: { automationId: randomUUID() } }),
    );
    expect(error.code).toBe('not_found');
  });
});

describe('dry runs and simulations', () => {
  it('sends a simulation its parsed scenario and the person breakpoints', async () => {
    const id = programOf();
    const reply = await call(E.startProgramRun, rig.owner.caller, {
      body: { automationId: id, mode: 'simulate', scenario: SCENARIO, breakpoints: ['n1'] },
    });
    expect(reply).toMatchObject({ status: 'rehearsed', mode: 'simulate', outputs: { level: 3 } });
    expect(sent[0]).toMatchObject({
      mode: 'simulate',
      automationId: id,
      breakpoints: ['n1'],
      startedBy: rig.owner.profileId,
      scenario: { start: START },
    });
  });

  it('sends a dry run its overrides and reports a failure as not ok', async () => {
    const id = programOf();
    outcome = rehearsalOf({ outcome: 'failed', error: 'x' });
    const reply = await call(E.startProgramRun, rig.owner.caller, {
      body: {
        automationId: id,
        mode: 'dry',
        overrides: { devices: [{ device: 'lamp', control: 'power', value: true }] },
      },
    });
    expect(reply).toMatchObject({ ok: false, status: 'rehearsed', mode: 'dry' });
    expect(sent[0]?.overrides).toMatchObject({ devices: [{ device: 'lamp' }] });
  });

  it('refuses a simulation without a scenario and a dry run with one', async () => {
    const id = programOf();
    const missing = await refused(
      call(E.startProgramRun, rig.owner.caller, { body: { automationId: id, mode: 'simulate' } }),
    );
    expect(missing.message).toContain('needs a scenario');
    const extra = await refused(
      call(E.startProgramRun, rig.owner.caller, {
        body: { automationId: id, mode: 'dry', scenario: SCENARIO },
      }),
    );
    expect(extra.message).toContain('overrides');
    expect(sent).toHaveLength(0);
  });

  it('refuses a scenario that does not parse', async () => {
    const id = programOf();
    const error = await refused(
      call(E.startProgramRun, rig.owner.caller, {
        body: { automationId: id, mode: 'simulate', scenario: { start: 'soon' } },
      }),
    );
    expect(error.code).toBe('invalid_request');
  });
});

describe('reading runs', () => {
  it('lists summaries newest first for one automation', async () => {
    const id = programOf();
    const other = programOf();
    const first = runOf(id);
    runOf(other);
    const second = runOf(id);
    const list = await call(E.listProgramRuns, rig.owner.caller, {
      query: { automationId: id },
    });
    expect(list.map((run) => run.id)).toStrictEqual([second.id, first.id]);
    for (const run of list) expect(RUN_RECORD_STATUS.safeParse(run.status).success).toBe(true);
  });

  it('gives the run view its node records and the nodes view pages and filters them', async () => {
    const id = programOf();
    const run = runOf(id);
    const loop = randomUUID();
    const other = randomUUID();
    nodes.append(run.id, [
      activation('n1', other, 0),
      activation('l[0]/n2', loop, 0),
      activation('l[1]/n2', loop, 1),
      activation('l[2]/n2', loop, 2),
    ]);
    const view = await call(E.readProgramRun, rig.owner.caller, {
      params: { runId: run.id },
    });
    expect(view.run.id).toBe(run.id);
    expect(view.nodes).toHaveLength(4);
    expect(view.next).toBeNull();

    const paged = await call(E.readProgramRunNodes, rig.owner.caller, {
      params: { runId: run.id },
      query: { limit: '2' },
    });
    expect(paged.nodes.map((node) => node.seq)).toStrictEqual([0, 1]);
    expect(paged.next).toBe(1);

    const rest = await call(E.readProgramRunNodes, rig.owner.caller, {
      params: { runId: run.id },
      query: { after: String(paged.next), limit: '5' },
    });
    expect(rest.nodes.map((node) => node.seq)).toStrictEqual([2, 3]);
    expect(rest.next).toBeNull();

    const byNode = await call(E.readProgramRunNodes, rig.owner.caller, {
      params: { runId: run.id },
      query: { nodeId: loop, iteration: '1' },
    });
    expect(byNode.nodes.map((node) => node.path)).toStrictEqual(['l[1]/n2']);
  });

  it('pages a single node by cursor', async () => {
    const id = programOf();
    const run = runOf(id);
    const loop = randomUUID();
    nodes.append(
      run.id,
      [0, 1, 2].map((index) => activation(`l[${String(index)}]/n`, loop, index)),
    );
    const first = await call(E.readProgramRunNodes, rig.owner.caller, {
      params: { runId: run.id },
      query: { nodeId: loop, limit: '2' },
    });
    expect(first.nodes).toHaveLength(2);
    expect(first.next).toBe(1);
  });

  it('asks for the node when filtering by iteration', async () => {
    const run = runOf(programOf());
    const error = await refused(
      call(E.readProgramRunNodes, rig.owner.caller, {
        params: { runId: run.id },
        query: { iteration: '1' },
      }),
    );
    expect(error.code).toBe('invalid_request');
  });

  it('lists why an automation did not run', async () => {
    const id = programOf();
    decisions.record({ automationId: id, reason: 'single_busy', at: NOW.toISOString(), times: 3 });
    const rows = await call(E.listProgramDecisions, rig.owner.caller, {
      params: { automationId: id },
    });
    expect(rows).toMatchObject([{ reason: 'single_busy', count: 3 }]);
  });
});

describe('member scope', () => {
  it('shows a member only the automations they wrote', async () => {
    const mine = programOf(member);
    const theirs = programOf();
    const mineRun = runOf(mine);
    const theirRun = runOf(theirs);
    const list = await call(E.listProgramRuns, member);
    expect(list.map((run) => run.id)).toStrictEqual([mineRun.id]);
    const read = await refused(call(E.readProgramRun, member, { params: { runId: theirRun.id } }));
    expect(read.code).toBe('not_found');
    const start = await refused(
      call(E.startProgramRun, member, { body: { automationId: theirs } }),
    );
    expect(start.code).toBe('not_found');
    const stop = await refused(call(E.stopProgramRun, member, { params: { runId: theirRun.id } }));
    expect(stop.code).toBe('not_found');
    expect(cancelled).toStrictEqual([]);
  });

  it('applies the limit after member scope', async () => {
    const mineRun = runOf(programOf(member));
    const theirs = programOf();
    runOf(theirs);
    runOf(theirs);
    const list = await call(E.listProgramRuns, member, { query: { limit: '2' } });
    expect(list.map((run) => run.id)).toStrictEqual([mineRun.id]);
  });

  it('lets the owner see every run', async () => {
    runOf(programOf(member));
    runOf(programOf());
    const list = await call(E.listProgramRuns, rig.owner.caller);
    expect(list).toHaveLength(2);
  });
});

describe('stopping', () => {
  it('stops one run and replies with its summary', async () => {
    const run = runOf(programOf());
    const reply = await call(E.stopProgramRun, rig.owner.caller, { params: { runId: run.id } });
    expect(reply).toMatchObject({ id: run.id, status: 'cancelled' });
    expect(cancelled).toStrictEqual([run.id]);
  });

  it('stops only the runs of one control key', async () => {
    const id = programOf();
    const keyed = runOf(id, 'room-a');
    runOf(id, 'room-b');
    const reply = await call(E.stopProgramRuns, rig.owner.caller, {
      body: { automationId: id, key: 'room-a' },
    });
    expect(reply).toStrictEqual({ stopped: 1 });
    expect(cancelled).toStrictEqual([keyed.id]);
  });

  it('stops every active run of an automation without a key', async () => {
    const id = programOf();
    runOf(id);
    runOf(id, 'room-b');
    const reply = await call(E.stopProgramRuns, rig.owner.caller, { body: { automationId: id } });
    expect(reply).toStrictEqual({ stopped: 2 });
  });
});

describe('stored tests', () => {
  const body = {
    name: 'Evening',
    scenario: SCENARIO,
    expectations: [{ kind: 'status', equals: 'succeeded' }],
  };

  it('creates, lists, replaces and removes a test', async () => {
    const id = programOf();
    const params = { automationId: id };
    const made = await call(E.createProgramTest, rig.owner.caller, { params, body });
    await call(E.saveProgramTest, rig.owner.caller, {
      params: { ...params, testId: made.id },
      body: { ...body, name: 'Night' },
    });
    const listed = await call(E.listProgramTests, rig.owner.caller, { params });
    expect(listed.map((test) => test.name)).toStrictEqual(['Night']);
    await call(E.removeProgramTest, rig.owner.caller, { params: { ...params, testId: made.id } });
    expect(await call(E.listProgramTests, rig.owner.caller, { params })).toStrictEqual([]);
  });

  it('refuses a test whose scenario does not parse and an unknown test', async () => {
    const id = programOf();
    const params = { automationId: id };
    const bad = await refused(
      call(E.createProgramTest, rig.owner.caller, { params, body: { ...body, scenario: {} } }),
    );
    expect(bad.code).toBe('invalid_request');
    await expect(
      call(E.saveProgramTest, rig.owner.caller, {
        params: { ...params, testId: randomUUID() },
        body,
      }),
    ).rejects.toBeInstanceOf(StoreNotFoundError);
  });

  it('runs all tests as simulations and reports each failed expectation', async () => {
    const id = programOf();
    const params = { automationId: id };
    await call(E.createProgramTest, rig.owner.caller, { params, body });
    await call(E.createProgramTest, rig.owner.caller, {
      params,
      body: {
        name: 'Zeta',
        scenario: SCENARIO,
        expectations: [
          { kind: 'command', effect: 'device.set', target: 'lamp', times: 1 },
          { kind: 'output', name: 'level', equals: 9 },
          { kind: 'visited', node: 'n9' },
          { kind: 'visited', node: 'n9', visited: false },
        ],
      },
    });
    outcome = rehearsalOf({
      commands: [
        {
          at: START,
          runId: 'r',
          path: 'p',
          node: 'n1',
          kind: 'device.set',
          key: 'k',
          targets: ['lamp'],
          params: {},
          outcome: 'ok',
        },
      ],
    });
    const reply = await call(E.runProgramTests, rig.owner.caller, { params });
    expect(sent.map((request) => request.mode)).toStrictEqual(['simulate', 'simulate']);
    expect(reply).toMatchObject({ passed: 1, failed: 1 });
    const failed = reply.results.find((result) => result.name === 'Zeta');
    expect(failed?.failures.map((failure) => failure.message)).toStrictEqual([
      'The output level was not the expected value.',
      'The node n9 was not visited.',
    ]);
  });
});

describe('the endpoint table', () => {
  it('keeps its paths and methods unique', () => {
    const keys = Object.values(E).map((shape) => `${shape.method} ${shape.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
