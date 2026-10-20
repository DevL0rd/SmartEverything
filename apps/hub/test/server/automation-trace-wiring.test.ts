import {
  AUTOMATION_RUN_ID,
  type AutomationRunRecord,
  type AutomationTraceNotice,
  type ClientRow,
  type ProcessWindow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { Viewers } from '../../src/metrics/viewers';
import { wireAutomationTrace } from '../../src/server/automation-trace-wiring';
import { readSubscribe } from '../../src/server/live-subscribe';
import { LiveWatch, type WatchNotice } from '../../src/server/live-watch';
import { testLogger } from '../support/logs';

const AUTOMATION = '11111111-1111-4111-8111-111111111111';
const RUN = '33333333-3333-4333-8333-333333333333';
const AT = '2026-10-19T10:00:00.000Z';

const OWNER: ClientRow = {
  id: 'owner',
  name: 'owner',
  platform: 'android',
  kind: 'phone',
  role: 'owner',
  built_in: false,
  profile_id: null,
  created_at: AT,
  last_seen_at: null,
};

function record(): AutomationRunRecord {
  return {
    id: AUTOMATION_RUN_ID.parse(RUN),
    automation_id: AUTOMATION,
    revision: 1,
    owner_profile_id: null,
    control_key: null,
    parent_run_id: null,
    status: 'running',
    mode: 'live',
    plan_hash: 'a'.repeat(64),
    current_node: null,
    started_by: null,
    steps: 0,
    commands: 0,
    iterations: 0,
    active_paths: ['a#1'],
    wake_at: null,
    error: null,
    created_at: AT,
    started_at: AT,
    finished_at: null,
    state: null,
    trigger: null,
    cause_chain: [],
    waiting_on: null,
    plan_refs: [],
  };
}

describe('automation trace wiring', () => {
  it('accepts the watch message on the live socket', () => {
    const read = readSubscribe(
      JSON.stringify({ type: 'watch_automations', demands: [{ automationId: AUTOMATION }] }),
    );
    expect(read).toMatchObject({ type: 'watch_automations' });
  });

  it('marks watched subjects, sends the keyframe and relays published notices', () => {
    const sent: AutomationTraceNotice[] = [];
    const viewers = new Viewers<ProcessWindow>();
    const watches = new LiveWatch<{
      id: number;
      client: ClientRow;
      socket: { bufferedAmount: number };
    }>({
      send: (_to, _message: WatchNotice): void => undefined,
      sendTrace: (_to, notice): void => {
        sent.push(notice);
      },
      log: testLogger(),
    });
    const wiring = wireAutomationTrace({
      live: { watches },
      viewers,
      owners: { authorOf: () => null, automationOfRun: () => AUTOMATION },
      store: { profiles: { activeOf: () => ({ id: 'p' }) } },
      records: { active: () => [record()], byId: () => record() },
      nodes: { forRun: () => [] },
      now: () => AT,
    });
    const connection = { id: 1, client: OWNER, socket: { bufferedAmount: 0 } };
    expect(wiring.trace.watched(`automation:${AUTOMATION}`)).toBe(false);
    watches.receiveTrace(connection, {
      type: 'watch_automations',
      demands: [{ automationId: AUTOMATION }],
    });
    expect(wiring.trace.watched(`automation:${AUTOMATION}`)).toBe(true);
    expect(sent[0]).toMatchObject({ type: 'trace_keyframe', automationId: AUTOMATION });
    wiring.trace.publish({
      type: 'trace_run_finished',
      automationId: AUTOMATION,
      runId: RUN,
      outcome: 'succeeded',
    });
    expect(sent.at(-1)).toMatchObject({ type: 'trace_run_finished' });
    wiring.detach();
  });
});
