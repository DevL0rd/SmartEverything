import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AUTOMATION_RUN_ID } from '../../src/automation-runs';
import { EMPTY_LAYOUT } from '../../src/automation-v3/layout';
import type { AutomationV3, FunctionV3 } from '../../src/automation-v3/program';
import {
  ACTIVE_RUN_RECORD_STATUSES,
  AUTOMATION_DECISION,
  AUTOMATION_REVISION_ROW,
  AUTOMATION_ROW_V3,
  AUTOMATION_RUN_RECORD,
  AUTOMATION_RUN_SUMMARY,
  DECISION_REASONS,
  FUNCTION_REVISION_ROW,
  FUNCTION_ROW,
  RUN_NODE_RECORD,
  RUN_RECORD_ONLY_FIELDS,
  RUN_RECORD_STATUS,
  STORED_TEST,
  summaryOf,
  type AutomationRunRecord,
} from '../../src/automation-v3/rows';

const ID = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';
const HASH = 'a'.repeat(64);
const MOMENT = '2026-10-18T10:00:00+07:00';
const AUTHOR = { via: 'person', profile_id: ID } as const;

const automation: AutomationV3 = {
  version: 3,
  kind: 'automation',
  triggers: [],
  inputs: [],
  outputs: [],
  variables: [],
  body: { nodes: [] },
  policy: { mode: 'single' },
};

const fn: FunctionV3 = {
  version: 3,
  kind: 'function',
  flavour: 'pure',
  inputs: [],
  outputs: [],
  exits: ['done'],
  variables: [],
  body: { nodes: [] },
};

const flowError = {
  class: 'Failed',
  message: 'boom',
  node: ID,
  path: 'n1',
  attempt: 1,
  at: MOMENT,
} as const;

const RUN_ID = AUTOMATION_RUN_ID.parse(ID_B);

const record: AutomationRunRecord = {
  id: RUN_ID,
  automation_id: ID,
  revision: 3,
  owner_profile_id: ID,
  control_key: null,
  parent_run_id: null,
  status: 'waiting',
  mode: 'live',
  plan_hash: HASH,
  current_node: 'n4',
  started_by: 'Button pressed',
  steps: 12,
  commands: 2,
  iterations: 0,
  active_paths: ['n4'],
  wake_at: MOMENT,
  error: null,
  created_at: MOMENT,
  started_at: MOMENT,
  finished_at: null,
  state: { frames: [{ pc: 4 }] },
  trigger: { kind: 'device.button' },
  cause_chain: [{ automation_id: ID, run_id: RUN_ID }],
  waiting_on: { kind: 'duration' },
  plan_refs: [{ function_id: ID, revision: 2 }],
};

const automationRow = {
  id: ID,
  name: 'Evening',
  enabled: true,
  revision: 1,
  definition: automation,
  draft: { program: automation, layout: EMPTY_LAYOUT },
  layout: EMPTY_LAYOUT,
  origin: null,
  author: AUTHOR,
  last_run_at: null,
  last_error: null,
  run_count: 0,
  created_at: MOMENT,
  updated_at: MOMENT,
};

describe('automation rows', () => {
  it('parses an automation row with draft and layout', () => {
    expect(AUTOMATION_ROW_V3.parse(automationRow)).toEqual(automationRow);
    expect(AUTOMATION_ROW_V3.parse({ ...automationRow, draft: null }).draft).toBeNull();
  });

  it('rejects a V2 shaped definition and extra columns', () => {
    expect(
      AUTOMATION_ROW_V3.safeParse({ ...automationRow, definition: { when: [] } }).success,
    ).toBe(false);
    expect(AUTOMATION_ROW_V3.safeParse({ ...automationRow, extra: 1 }).success).toBe(false);
    expect(AUTOMATION_ROW_V3.safeParse({ ...automationRow, revision: 0 }).success).toBe(false);
  });

  it('parses a revision row and demands a plan hash', () => {
    const row = {
      automation_id: ID,
      revision: 2,
      definition: automation,
      layout: EMPTY_LAYOUT,
      plan_hash: HASH,
      saved_at: MOMENT,
      author: null,
    };
    expect(AUTOMATION_REVISION_ROW.parse(row)).toEqual(row);
    expect(AUTOMATION_REVISION_ROW.safeParse({ ...row, plan_hash: 'ABC' }).success).toBe(false);
  });
});

describe('function rows', () => {
  const row = {
    id: ID,
    name: 'Dim lights',
    description: null,
    category: 'lights',
    icon: null,
    latest_revision: 1,
    created_by: ID,
    author: AUTHOR,
    created_at: MOMENT,
    updated_at: MOMENT,
    draft: { program: fn, layout: EMPTY_LAYOUT },
  };

  it('parses a function row and refuses an automation draft', () => {
    expect(FUNCTION_ROW.parse(row)).toEqual(row);
    expect(
      FUNCTION_ROW.safeParse({ ...row, draft: { program: automation, layout: EMPTY_LAYOUT } })
        .success,
    ).toBe(false);
  });

  it('parses a revision with interface hash and compat', () => {
    const revision = {
      function_id: ID,
      revision: 2,
      definition: fn,
      layout: EMPTY_LAYOUT,
      interface_hash: HASH,
      compat: 'breaking',
      plan_hash: HASH,
      saved_at: MOMENT,
      author: AUTHOR,
    };
    expect(FUNCTION_REVISION_ROW.parse(revision)).toEqual(revision);
    expect(FUNCTION_REVISION_ROW.safeParse({ ...revision, compat: 'maybe' }).success).toBe(false);
  });
});

describe('run records', () => {
  it('parses a parked record with every stored field', () => {
    expect(AUTOMATION_RUN_RECORD.parse(record)).toEqual(record);
  });

  it('knows waiting and paused and keeps them active', () => {
    for (const status of ['waiting', 'paused']) {
      expect(RUN_RECORD_STATUS.safeParse(status).success).toBe(true);
      expect(ACTIVE_RUN_RECORD_STATUSES.has(RUN_RECORD_STATUS.parse(status))).toBe(true);
    }
    expect(ACTIVE_RUN_RECORD_STATUSES.has('succeeded')).toBe(false);
  });

  it('accepts the three modes and refuses the old words', () => {
    for (const mode of ['live', 'dry', 'simulated']) {
      expect(AUTOMATION_RUN_RECORD.safeParse({ ...record, mode }).success).toBe(true);
    }
    for (const mode of ['real', 'simulate', 'dry_run']) {
      expect(AUTOMATION_RUN_RECORD.safeParse({ ...record, mode }).success).toBe(false);
    }
  });

  it('lists the replicated-away fields', () => {
    expect([...RUN_RECORD_ONLY_FIELDS].sort()).toEqual(
      ['cause_chain', 'plan_refs', 'state', 'trigger', 'waiting_on'].sort(),
    );
  });

  it('summaryOf drops the stored-only fields and parses as a summary', () => {
    const summary = summaryOf(record);
    for (const field of RUN_RECORD_ONLY_FIELDS) expect(summary).not.toHaveProperty(field);
    expect(AUTOMATION_RUN_SUMMARY.parse(summary)).toEqual(summary);
    expect(summary.status).toBe('waiting');
  });

  it('refuses a summary that carries a stored-only field', () => {
    for (const field of RUN_RECORD_ONLY_FIELDS) {
      expect(
        AUTOMATION_RUN_SUMMARY.safeParse({ ...summaryOf(record), [field]: null }).success,
      ).toBe(false);
    }
  });

  it('property: summaryOf never carries a state or trigger field', () => {
    fc.assert(
      fc.property(
        fc.record({
          status: fc.constantFrom(...RUN_RECORD_STATUS.options),
          mode: fc.constantFrom('live', 'dry', 'simulated'),
          marker: fc.uuid(),
          parked: fc.boolean(),
          steps: fc.nat(),
        }),
        ({ status, mode, marker, parked, steps }) => {
          const full = AUTOMATION_RUN_RECORD.parse({
            ...record,
            status,
            mode,
            steps,
            state: parked ? { marker } : null,
            trigger: { marker },
            waiting_on: { marker },
            cause_chain: [],
            plan_refs: [],
          });
          const summary = summaryOf(full);
          const keys = Object.keys(summary);
          expect(keys).not.toContain('state');
          expect(keys).not.toContain('trigger');
          for (const field of RUN_RECORD_ONLY_FIELDS) expect(keys).not.toContain(field);
          expect(JSON.stringify(summary)).not.toContain(marker);
        },
      ),
    );
  });
});

describe('node records, decisions and stored tests', () => {
  const node = {
    run_id: ID_B,
    seq: 0,
    path: 'call#n3/n9',
    node_id: ID,
    iteration: 0,
    status: 'failed',
    started_at: MOMENT,
    finished_at: MOMENT,
    duration_ms: 12,
    input_preview: { to: 5 },
    output_preview: null,
    truncated: false,
    error: flowError,
    command_ids: [ID],
    late: false,
  };

  it('parses a node record with an error value', () => {
    expect(RUN_NODE_RECORD.parse(node)).toEqual(node);
    expect(RUN_NODE_RECORD.safeParse({ ...node, status: 'paused' }).success).toBe(false);
    expect(RUN_NODE_RECORD.safeParse({ ...node, error: { class: 'Failed' } }).success).toBe(false);
  });

  it('parses a decision for every reason', () => {
    for (const reason of DECISION_REASONS) {
      const decision = {
        automation_id: ID,
        window_start: MOMENT,
        reason,
        count: 3,
        first_at: MOMENT,
        last_at: MOMENT,
        detail: null,
      };
      expect(AUTOMATION_DECISION.parse(decision)).toEqual(decision);
    }
    expect(
      AUTOMATION_DECISION.safeParse({
        automation_id: ID,
        window_start: MOMENT,
        reason: 'other',
        count: 0,
        first_at: MOMENT,
        last_at: MOMENT,
        detail: null,
      }).success,
    ).toBe(false);
  });

  it('parses a stored test', () => {
    const stored = {
      automation_id: ID,
      id: ID_B,
      name: 'Motion at night',
      scenario: { at: MOMENT },
      expectations: [{ node: 'a', status: 'succeeded' }],
      updated_at: MOMENT,
    };
    expect(STORED_TEST.parse(stored)).toEqual(stored);
    expect(STORED_TEST.safeParse({ ...stored, name: ' ' }).success).toBe(false);
  });
});
