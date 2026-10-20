import { z } from 'zod';
import {
  AUTOMATION_RUN_SUMMARY,
  AUTOMATION_DECISION,
  RUN_NODE_RECORD,
  STORED_TEST,
} from '../automation-v3';
import { SIGNAL_INPUT } from '../signals';
import { JSON_VALUE } from '../values';
import { NO_BODY, endpoint } from './endpoint';
import { COUNT, DONE, FLAG, ID, JSON_OBJECT, MOMENT, NOTHING, queryLimit } from './primitives';

const TEXT = z.string().min(1);
const RUN_PARAMS = z.strictObject({ runId: ID });
const AUTOMATION_PARAMS = z.strictObject({ automationId: ID });
const TEST_PARAMS = z.strictObject({ automationId: ID, testId: ID });

export const AUTOMATION_RUN_START_MODES = ['live', 'dry', 'simulate'] as const;

export const AUTOMATION_RUN_TRIGGER = z.strictObject({
  key: TEXT,
  signal: SIGNAL_INPUT.omit({ at: true }).optional(),
});

export type AutomationRunTrigger = z.infer<typeof AUTOMATION_RUN_TRIGGER>;

export const AUTOMATION_RUN_START_REQUEST = z.strictObject({
  automationId: ID,
  mode: z.enum(AUTOMATION_RUN_START_MODES).default('live'),
  inputs: JSON_OBJECT.default({}),
  scenario: JSON_OBJECT.optional(),
  overrides: JSON_OBJECT.optional(),
  trigger: AUTOMATION_RUN_TRIGGER.optional(),
  breakpoints: z.array(TEXT).default([]),
  wait: FLAG.default(false),
});

export type AutomationRunStartRequest = z.infer<typeof AUTOMATION_RUN_START_REQUEST>;

export const AUTOMATION_RUN_WOULD_SEND = z.strictObject({
  at: MOMENT,
  runId: TEXT,
  path: TEXT,
  node: TEXT,
  kind: TEXT,
  key: z.string(),
  targets: z.array(z.string()),
  params: JSON_OBJECT,
  outcome: z.enum(['ok', 'fail', 'offline', 'unknown', 'slow']),
});

export type AutomationRunWouldSend = z.infer<typeof AUTOMATION_RUN_WOULD_SEND>;

export const AUTOMATION_RUN_PAUSE = z.strictObject({
  runId: TEXT,
  nodeId: TEXT,
  path: TEXT,
});

export const AUTOMATION_RUN_REHEARSAL_OUTCOMES = [
  'succeeded',
  'failed',
  'cancelled',
  'paused',
  'idle',
  'horizon',
  'steps',
] as const;

export const AUTOMATION_RUN_REHEARSAL = z.strictObject({
  outcome: z.enum(AUTOMATION_RUN_REHEARSAL_OUTCOMES),
  error: z.string().nullable(),
  now: MOMENT.nullable(),
  steps: COUNT,
  run: AUTOMATION_RUN_SUMMARY.nullable(),
  nodes: z.array(RUN_NODE_RECORD),
  commands: z.array(AUTOMATION_RUN_WOULD_SEND),
  paused: z.array(AUTOMATION_RUN_PAUSE),
  outputs: JSON_OBJECT.nullable(),
});

export type AutomationRunRehearsal = z.infer<typeof AUTOMATION_RUN_REHEARSAL>;

export const AUTOMATION_RUN_START_REPLY = z.strictObject({
  ok: FLAG,
  summary: TEXT,
  mode: z.enum(AUTOMATION_RUN_START_MODES),
  status: z.enum(['started', 'queued', 'finished', 'rehearsed']),
  run: AUTOMATION_RUN_SUMMARY.nullable(),
  outputs: JSON_OBJECT.nullable(),
  rehearsal: AUTOMATION_RUN_REHEARSAL.nullable(),
});

export type AutomationRunStartReply = z.infer<typeof AUTOMATION_RUN_START_REPLY>;

export const AUTOMATION_RUN_NODES_PAGE = z.strictObject({
  nodes: z.array(RUN_NODE_RECORD),
  next: z.int().min(0).nullable(),
});

export type AutomationRunNodesPage = z.infer<typeof AUTOMATION_RUN_NODES_PAGE>;

export const AUTOMATION_RUN_VIEW = AUTOMATION_RUN_NODES_PAGE.extend({
  run: AUTOMATION_RUN_SUMMARY,
});

export type AutomationRunView = z.infer<typeof AUTOMATION_RUN_VIEW>;

export const AUTOMATION_RUN_STOP_REPLY = z.strictObject({ stopped: COUNT });

export const AUTOMATION_TEST_EXPECTATION = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('status'),
    equals: z.enum(['succeeded', 'failed', 'cancelled']),
  }),
  z.strictObject({
    kind: z.literal('command'),
    effect: TEXT,
    target: TEXT.optional(),
    times: COUNT.default(1),
  }),
  z.strictObject({ kind: z.literal('output'), name: TEXT, equals: JSON_VALUE }),
  z.strictObject({ kind: z.literal('visited'), node: TEXT, visited: FLAG.default(true) }),
]);

export type AutomationTestExpectation = z.infer<typeof AUTOMATION_TEST_EXPECTATION>;

export const AUTOMATION_TEST_INPUT = z.strictObject({
  name: STORED_TEST.shape.name,
  scenario: JSON_OBJECT,
  expectations: z.array(AUTOMATION_TEST_EXPECTATION).default([]),
});

export type AutomationTestInput = z.infer<typeof AUTOMATION_TEST_INPUT>;

export const AUTOMATION_TEST_FAILURE = z.strictObject({
  expectation: AUTOMATION_TEST_EXPECTATION,
  message: TEXT,
});

export const AUTOMATION_TEST_RESULT = z.strictObject({
  testId: ID,
  name: TEXT,
  passed: FLAG,
  outcome: z.enum(AUTOMATION_RUN_REHEARSAL_OUTCOMES),
  failures: z.array(AUTOMATION_TEST_FAILURE),
});

export type AutomationTestResult = z.infer<typeof AUTOMATION_TEST_RESULT>;

export const AUTOMATION_TESTS_RUN_REPLY = z.strictObject({
  passed: COUNT,
  failed: COUNT,
  results: z.array(AUTOMATION_TEST_RESULT),
});

export type AutomationTestsRunReply = z.infer<typeof AUTOMATION_TESTS_RUN_REPLY>;

export const AUTOMATION_RUN_ENDPOINTS = {
  startProgramRun: endpoint({
    method: 'POST',
    path: '/api/automation-runs',
    access: 'member',
    summary:
      'Start an automation. mode live (default) runs it for real; dry records the commands it would send and the value of every node; simulate runs a scenario on a virtual clock. dry and simulate take the person’s breakpoint list; wait returns the program outputs',
    params: NOTHING,
    query: NOTHING,
    body: AUTOMATION_RUN_START_REQUEST,
    response: AUTOMATION_RUN_START_REPLY,
  }),
  listProgramRuns: endpoint({
    method: 'GET',
    path: '/api/automation-runs',
    access: 'member',
    summary: 'Recent runs, newest first, optionally for one automation',
    params: NOTHING,
    query: z.strictObject({ automationId: ID.optional(), limit: queryLimit(50, 200) }),
    body: NO_BODY,
    response: z.array(AUTOMATION_RUN_SUMMARY),
  }),
  readProgramRun: endpoint({
    method: 'GET',
    path: '/api/automation-runs/:runId',
    access: 'member',
    summary:
      'One run: its summary and the first node records with status, previews, errors and command ids; the nodes view pages the rest',
    params: RUN_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_RUN_VIEW,
  }),
  readProgramRunNodes: endpoint({
    method: 'GET',
    path: '/api/automation-runs/:runId/nodes',
    access: 'member',
    summary:
      'Node records of one run, paged by sequence, optionally for one node and one loop iteration',
    params: RUN_PARAMS,
    query: z.strictObject({
      after: z.coerce.number().int().min(-1).default(-1),
      limit: queryLimit(100, 500),
      nodeId: ID.optional(),
      iteration: z.coerce.number().int().min(0).optional(),
    }),
    body: NO_BODY,
    response: AUTOMATION_RUN_NODES_PAGE,
  }),
  stopProgramRun: endpoint({
    method: 'POST',
    path: '/api/automation-runs/:runId/stop',
    access: 'member',
    summary:
      'Idempotently cancel a run’s future actions; commands already sent to devices may still complete',
    params: RUN_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_RUN_SUMMARY,
  }),
  stopProgramRuns: endpoint({
    method: 'POST',
    path: '/api/automation-runs/stop',
    access: 'member',
    summary:
      'Stop the active and queued runs of an automation, or only those that use one control key',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ automationId: ID, key: z.string().trim().min(1).max(100).optional() }),
    response: AUTOMATION_RUN_STOP_REPLY,
  }),
  listProgramDecisions: endpoint({
    method: 'GET',
    path: '/api/automation-decisions/:automationId',
    access: 'member',
    summary: 'Why an automation did not run, counted per minute and reason',
    params: AUTOMATION_PARAMS,
    query: z.strictObject({ since: MOMENT.optional(), limit: queryLimit(100, 500) }),
    body: NO_BODY,
    response: z.array(AUTOMATION_DECISION),
  }),
  listProgramTests: endpoint({
    method: 'GET',
    path: '/api/automation-tests/:automationId',
    access: 'member',
    summary: 'Stored test scenarios of an automation with their expectations',
    params: AUTOMATION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(STORED_TEST),
  }),
  createProgramTest: endpoint({
    method: 'POST',
    path: '/api/automation-tests/:automationId',
    access: 'member',
    summary: 'Store a test: a simulation scenario and what it must produce',
    params: AUTOMATION_PARAMS,
    query: NOTHING,
    body: AUTOMATION_TEST_INPUT,
    response: STORED_TEST,
  }),
  saveProgramTest: endpoint({
    method: 'PUT',
    path: '/api/automation-tests/:automationId/:testId',
    access: 'member',
    summary: 'Replace a stored test',
    params: TEST_PARAMS,
    query: NOTHING,
    body: AUTOMATION_TEST_INPUT,
    response: STORED_TEST,
  }),
  removeProgramTest: endpoint({
    method: 'DELETE',
    path: '/api/automation-tests/:automationId/:testId',
    access: 'member',
    summary: 'Delete a stored test',
    params: TEST_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  runProgramTests: endpoint({
    method: 'POST',
    path: '/api/automation-tests/:automationId/run',
    access: 'member',
    summary:
      'Run every stored test of an automation as a simulation and report which expectations failed',
    params: AUTOMATION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_TESTS_RUN_REPLY,
  }),
} as const;
