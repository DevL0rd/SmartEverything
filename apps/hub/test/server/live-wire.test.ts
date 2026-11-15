import {
  AI_HARNESS_NOTICE,
  AUTOMATION_ROW,
  LIVE_MESSAGE,
  LIVE_WIRE_MESSAGE,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { liveText, wireText } from '../../src/server/live-wire';

describe('wireText', () => {
  it('sends a notice that is not a table change as its own JSON', () => {
    const notice = AI_HARNESS_NOTICE.parse({
      type: 'ai_harness',
      event: {
        kind: 'text',
        session_id: 'dsh-session',
        chat_id: crypto.randomUUID(),
        epoch: 1,
        seq: 0,
        delta: 'x'.repeat(16_000),
      },
    });
    expect(wireText(notice)).toBe(JSON.stringify(notice));
  });

  it('leaves the previous plugin stream value off the wire', () => {
    const row = (value: number): object => ({
      plugin_id: 'adguard',
      stream: 'queries',
      value: { rows: Array.from({ length: 50 }, (_, index) => index + value) },
      at: '2026-10-17T00:00:00.000Z',
    });
    const change = LIVE_MESSAGE.parse({
      type: 'change',
      table: 'plugin_streams',
      operation: 'UPDATE',
      seq: 1,
      record: row(1),
      oldRecord: row(0),
    });
    const sent: unknown = JSON.parse(wireText(change));
    expect(sent).toStrictEqual({
      type: 'change',
      table: 'plugin_streams',
      operation: 'UPDATE',
      key: { plugin_id: 'adguard', stream: 'queries' },
      set: { value: { rows: Array.from({ length: 50 }, (_, index) => index + 1) } },
      previous: {},
      seq: 1,
    });
  });

  it('sends an automation run only the counter columns it changed', () => {
    const automation = AUTOMATION_ROW.parse({
      id: crypto.randomUUID(),
      name: 'Porch light',
      enabled: true,
      revision: 3,
      definition: {
        version: 4,
        kind: 'automation',
        triggers: [],
        inputs: [],
        outputs: [],
        variables: [],
        nodes: [{ id: crypto.randomUUID(), key: 'start', kind: 'flow.start' }],
        policy: { mode: 'single' },
      },
      draft: null,
      layout: { nodes: {}, frames: [], comments: [] },
      origin: null,
      author: { via: 'person', profile_id: crypto.randomUUID() },
      last_run_at: '2026-10-17T00:00:00.000Z',
      last_error: null,
      run_count: 5,
      created_at: '2026-10-17T00:00:00.000Z',
      updated_at: '2026-10-17T00:00:00.000Z',
    });
    const ran = { ...automation, last_run_at: '2026-10-17T00:01:00.000Z', run_count: 6 };
    const change = LIVE_MESSAGE.parse({
      type: 'change',
      table: 'automations',
      operation: 'UPDATE',
      seq: 9,
      record: ran,
      oldRecord: automation,
    });
    const text = wireText(change);
    expect(LIVE_WIRE_MESSAGE.parse(JSON.parse(text))).toStrictEqual({
      type: 'change',
      table: 'automations',
      operation: 'UPDATE',
      key: { id: automation.id },
      set: { last_run_at: ran.last_run_at, run_count: 6 },
      previous: { last_run_at: automation.last_run_at, run_count: 5 },
      seq: 9,
    });
    expect(text.length * 4).toBeLessThan(JSON.stringify(change).length);
  });
});

describe('liveText', () => {
  const presence = LIVE_MESSAGE.parse({
    type: 'computer_claude',
    device_id: crypto.randomUUID(),
    notice: { type: 'claude_session_gone', id: crypto.randomUUID() },
  });

  it.each([
    presence,
    LIVE_MESSAGE.parse({ type: 'hub_update_status_changed' }),
    LIVE_MESSAGE.parse({ type: 'hub_update_source_changed' }),
  ])('keeps $type off a member connection and sends it to an owner', (notice) => {
    expect(liveText('member', notice)).toBeNull();
    expect(liveText('owner', notice)).toBe(JSON.stringify(notice));
  });

  it('sends a member every other notice unchanged', () => {
    const notice = LIVE_MESSAGE.parse({ type: 'profile_changed', profileId: crypto.randomUUID() });
    expect(liveText('member', notice)).toBe(JSON.stringify(notice));
  });
});
