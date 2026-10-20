import { listRuns } from './automation-run-listing';
import { isDeepStrictEqual } from 'node:util';
import {
  AUTOMATION_RUN_ENDPOINTS as E,
  AUTOMATION_TEST_EXPECTATION,
  ApiError,
  JSON_VALUE,
  type AutomationRunNodesPage,
  type AutomationRunRehearsal,
  type AutomationRunStartReply,
  type AutomationRunStartRequest,
  type AutomationRunTrigger,
  type AutomationRunSummary,
  type AutomationTestExpectation,
  type AutomationTestInput,
  type AutomationTestResult,
  type AutomationTestsRunReply,
  type JsonValue,
  type RunNodeRecord,
  type StoredTest,
} from '@smarteverything/domain';
import type { CancelReason } from '@smarteverything/flow/state/run-state';
import type { Submission } from '../../automations/driver/admission';
import type { OVERRIDES, ScenarioInput } from '../../automations/sim/scenario';
import {
  invalid,
  rehearsalRequestOf,
  requireLiveOnly,
  scenarioOf,
} from './automation-run-requests';
import type { AutomationDecisionsRepository } from '../../store/repositories/automation-decisions';
import type { AutomationProgramsRepository } from '../../store/repositories/automation-programs';
import type { AutomationRunNodesRepository } from '../../store/repositories/automation-run-nodes';
import type { AutomationRunRecordsRepository } from '../../store/repositories/automation-run-records';
import type { AutomationTestsRepository } from '../../store/repositories/automation-tests';
import type { Store } from '../../store/store';
import { profileIdOf, roleOfCaller, type Caller } from '../auth';
import { DONE_REPLY, bound } from '../router';
import type { z } from 'zod';

const STOP: CancelReason = 'user_stop';
const FIRST_NODES = 100;

export type RunOutputs = Readonly<Record<string, JsonValue>> | null;

export interface RunsEngine {
  readonly start: (
    automationId: string,
    inputs: Readonly<Record<string, JsonValue>>,
    startedBy: string | null,
  ) => Submission;
  readonly cancel: (runId: string, reason: CancelReason) => boolean;
  readonly cancelAutomation: (automationId: string, reason: CancelReason, key?: string) => number;
  readonly finished: (runId: string) => Promise<RunOutputs>;
}

export interface RehearsalRequest {
  readonly automationId: string;
  readonly mode: 'dry' | 'simulate';
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly scenario: ScenarioInput | undefined;
  readonly overrides: z.input<typeof OVERRIDES> | undefined;
  readonly breakpoints: readonly string[];
  readonly trigger: AutomationRunTrigger | undefined;
  readonly startedBy: string;
}

export interface Rehearsals {
  readonly run: (request: RehearsalRequest) => Promise<AutomationRunRehearsal>;
}

export interface AutomationRunsDeps {
  readonly store: Store;
  readonly programs: Pick<AutomationProgramsRepository, 'find' | 'list'>;
  readonly records: Pick<
    AutomationRunRecordsRepository,
    'summaries' | 'summariesOf' | 'summaryById' | 'active'
  >;
  readonly nodes: Pick<AutomationRunNodesRepository, 'forRun' | 'ofNode'>;
  readonly decisions: Pick<AutomationDecisionsRepository, 'forAutomation'>;
  readonly tests: Pick<AutomationTestsRepository, 'list' | 'byId' | 'save' | 'remove'>;
  readonly engine: RunsEngine;
  readonly rehearsals: Rehearsals;
}

function canSee(deps: AutomationRunsDeps, caller: Caller, automationId: string): boolean {
  if (roleOfCaller(caller) === 'owner') return true;
  const author = deps.programs.find(automationId)?.author ?? null;
  return author !== null && author.profile_id === profileIdOf(deps.store, caller);
}

function requireVisible(deps: AutomationRunsDeps, caller: Caller, automationId: string): void {
  if (!canSee(deps, caller, automationId)) {
    throw new ApiError('not_found', 'There is no such automation.');
  }
}

function requireProgram(deps: AutomationRunsDeps, caller: Caller, automationId: string): void {
  if (deps.programs.find(automationId) === undefined) {
    throw new ApiError('not_found', 'There is no such automation.');
  }
  requireVisible(deps, caller, automationId);
}

function summaryOfRun(
  deps: AutomationRunsDeps,
  caller: Caller,
  runId: string,
): AutomationRunSummary {
  const run = deps.records.summaryById(runId);
  requireVisible(deps, caller, run.automation_id);
  return run;
}

function pageOf(records: readonly RunNodeRecord[], limit: number): AutomationRunNodesPage {
  const nodes = records.slice(0, limit);
  const last = nodes.at(-1);
  return { nodes, next: records.length > limit && last !== undefined ? last.seq : null };
}

function nodesOf(
  deps: AutomationRunsDeps,
  runId: string,
  query: {
    readonly after: number;
    readonly limit: number;
    readonly nodeId?: string | undefined;
    readonly iteration?: number | undefined;
  },
): AutomationRunNodesPage {
  const { after, limit, nodeId, iteration } = query;
  if (nodeId === undefined) {
    if (iteration !== undefined) throw invalid('Filtering by iteration needs the node as well.');
    return pageOf(deps.nodes.forRun(runId, after, limit + 1), limit);
  }
  const wanted = deps.nodes
    .ofNode(runId, nodeId)
    .filter(
      (node) => node.seq > after && (iteration === undefined || node.iteration === iteration),
    );
  return pageOf(wanted, limit);
}

async function rehearse(
  deps: AutomationRunsDeps,
  body: AutomationRunStartRequest,
  startedBy: string,
  mode: 'dry' | 'simulate',
): Promise<AutomationRunStartReply> {
  const rehearsal = await deps.rehearsals.run(rehearsalRequestOf(body, startedBy, mode));
  return {
    ok: rehearsal.outcome !== 'failed',
    summary: `The ${mode === 'dry' ? 'dry run' : 'simulation'} ${rehearsal.outcome}.`,
    mode: body.mode,
    status: 'rehearsed',
    run: rehearsal.run,
    outputs: rehearsal.outputs,
    rehearsal,
  };
}

async function startLive(
  deps: AutomationRunsDeps,
  body: AutomationRunStartRequest,
  startedBy: string,
): Promise<AutomationRunStartReply> {
  requireLiveOnly(body);
  const submission = deps.engine.start(body.automationId, body.inputs, startedBy);
  if (submission.kind === 'refused') throw submission.error;
  const started = submission.kind === 'started';
  if (!body.wait) {
    return {
      ok: true,
      summary: started ? 'The run started.' : 'The run is queued behind the one in progress.',
      mode: 'live',
      status: submission.kind,
      run: deps.records.summaryById(submission.runId),
      outputs: null,
      rehearsal: null,
    };
  }
  const outputs = await deps.engine.finished(submission.runId);
  const run = deps.records.summaryById(submission.runId);
  return {
    ok: run.status === 'succeeded',
    summary: `The run ${run.status}.`,
    mode: 'live',
    status: 'finished',
    run,
    outputs,
    rehearsal: null,
  };
}

function start(
  deps: AutomationRunsDeps,
  caller: Caller,
  body: AutomationRunStartRequest,
): Promise<AutomationRunStartReply> {
  requireProgram(deps, caller, body.automationId);
  const startedBy = profileIdOf(deps.store, caller);
  if (body.mode === 'live') return startLive(deps, body, startedBy);
  return rehearse(deps, body, startedBy, body.mode === 'dry' ? 'dry' : 'simulate');
}

function stopOne(deps: AutomationRunsDeps, caller: Caller, runId: string): AutomationRunSummary {
  summaryOfRun(deps, caller, runId);
  deps.engine.cancel(runId, STOP);
  return deps.records.summaryById(runId);
}

function stopMany(
  deps: AutomationRunsDeps,
  caller: Caller,
  automationId: string,
  key: string | undefined,
): { readonly stopped: number } {
  requireVisible(deps, caller, automationId);
  return { stopped: deps.engine.cancelAutomation(automationId, STOP, key) };
}

type Failure = (
  expectation: AutomationTestExpectation,
  report: AutomationRunRehearsal,
) => string | null;

function commandFailure(
  expectation: Extract<AutomationTestExpectation, { kind: 'command' }>,
  report: AutomationRunRehearsal,
): string | null {
  const times = report.commands.filter(
    (sent) =>
      sent.kind === expectation.effect &&
      (expectation.target === undefined || sent.targets.includes(expectation.target)),
  ).length;
  return times === expectation.times
    ? null
    : `${expectation.effect} was sent ${String(times)} times, expected ${String(expectation.times)}.`;
}

function visitedFailure(
  expectation: Extract<AutomationTestExpectation, { kind: 'visited' }>,
  report: AutomationRunRehearsal,
): string | null {
  const seen = report.nodes.some(
    (node) => node.node_id === expectation.node && node.status !== 'skipped',
  );
  return seen === expectation.visited
    ? null
    : `The node ${expectation.node} was ${seen ? 'visited' : 'not visited'}.`;
}

const expectationFailure: Failure = (expectation, report) => {
  switch (expectation.kind) {
    case 'status':
      return report.outcome === expectation.equals
        ? null
        : `The run ${report.outcome}, expected ${expectation.equals}.`;
    case 'command':
      return commandFailure(expectation, report);
    case 'output':
      return isDeepStrictEqual(report.outputs?.[expectation.name], expectation.equals)
        ? null
        : `The output ${expectation.name} was not the expected value.`;
    case 'visited':
      return visitedFailure(expectation, report);
  }
};

function resultOf(test: StoredTest, report: AutomationRunRehearsal): AutomationTestResult {
  const failures = AUTOMATION_TEST_EXPECTATION.array()
    .parse(test.expectations)
    .flatMap((expectation) => {
      const message = expectationFailure(expectation, report);
      return message === null ? [] : [{ expectation, message }];
    });
  return {
    testId: test.id,
    name: test.name,
    passed: failures.length === 0,
    outcome: report.outcome,
    failures,
  };
}

async function runTests(
  deps: AutomationRunsDeps,
  caller: Caller,
  automationId: string,
): Promise<AutomationTestsRunReply> {
  requireProgram(deps, caller, automationId);
  const startedBy = profileIdOf(deps.store, caller);
  const results = await Promise.all(
    deps.tests.list(automationId).map(async (test) =>
      resultOf(
        test,
        await deps.rehearsals.run({
          automationId,
          mode: 'simulate',
          inputs: {},
          scenario: scenarioOf(test.scenario),
          overrides: undefined,
          breakpoints: [],
          trigger: undefined,
          startedBy,
        }),
      ),
    ),
  );
  const passed = results.filter((result) => result.passed).length;
  return { passed, failed: results.length - passed, results };
}

interface TestTarget {
  readonly automationId: string;
  readonly testId?: string;
}

function saveTest(
  deps: AutomationRunsDeps,
  caller: Caller,
  target: TestTarget,
  input: AutomationTestInput,
): StoredTest {
  const { automationId, testId } = target;
  requireProgram(deps, caller, automationId);
  scenarioOf(input.scenario);
  if (testId !== undefined) deps.tests.byId(automationId, testId);
  return deps.tests.save({
    automationId,
    ...(testId === undefined ? {} : { id: testId }),
    name: input.name,
    scenario: input.scenario,
    expectations: JSON_VALUE.array().parse(input.expectations),
  });
}

export const automationRunRoutes = (deps: AutomationRunsDeps) =>
  ({
    startProgramRun: bound(E.startProgramRun, ({ body, caller }) => start(deps, caller, body)),
    listProgramRuns: bound(E.listProgramRuns, ({ query, caller }) => {
      if (query.automationId !== undefined) requireVisible(deps, caller, query.automationId);
      return listRuns(deps.records, deps.programs, query, {
        owner: roleOfCaller(caller) === 'owner',
        sees: (id) => canSee(deps, caller, id),
      });
    }),
    readProgramRun: bound(E.readProgramRun, ({ params, caller }) => ({
      run: summaryOfRun(deps, caller, params.runId),
      ...nodesOf(deps, params.runId, { after: -1, limit: FIRST_NODES }),
    })),
    readProgramRunNodes: bound(E.readProgramRunNodes, ({ params, query, caller }) => {
      summaryOfRun(deps, caller, params.runId);
      return nodesOf(deps, params.runId, query);
    }),
    stopProgramRun: bound(E.stopProgramRun, ({ params, caller }) =>
      stopOne(deps, caller, params.runId),
    ),
    stopProgramRuns: bound(E.stopProgramRuns, ({ body, caller }) =>
      stopMany(deps, caller, body.automationId, body.key),
    ),
    listProgramDecisions: bound(E.listProgramDecisions, ({ params, query, caller }) => {
      requireVisible(deps, caller, params.automationId);
      return deps.decisions.forAutomation(params.automationId, query.since ?? null, query.limit);
    }),
    listProgramTests: bound(E.listProgramTests, ({ params, caller }) => {
      requireVisible(deps, caller, params.automationId);
      return deps.tests.list(params.automationId);
    }),
    createProgramTest: bound(E.createProgramTest, ({ params, body, caller }) =>
      saveTest(deps, caller, { automationId: params.automationId }, body),
    ),
    saveProgramTest: bound(E.saveProgramTest, ({ params, body, caller }) =>
      saveTest(deps, caller, params, body),
    ),
    removeProgramTest: bound(E.removeProgramTest, ({ params, caller }) => {
      requireVisible(deps, caller, params.automationId);
      deps.tests.remove(params.automationId, params.testId);
      return DONE_REPLY;
    }),
    runProgramTests: bound(E.runProgramTests, ({ params, caller }) =>
      runTests(deps, caller, params.automationId),
    ),
  }) as const;
