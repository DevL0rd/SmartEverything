import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiAgentRun, AiChatRow } from '@smarteverything/domain';
import { admitInactiveRemoval } from '../../../src/assistant/coordination/inactive-removal';
import type { EngineStatus } from '../../../src/assistant/engines/engine';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function run(parent: AiChatRow, child: AiChatRow, state: AiAgentRun['state']): AiAgentRun {
  const id = randomUUID();
  return {
    id,
    parent_chat_id: parent.id,
    profile_id: rig.owner.profileId,
    source: 'smarteverything',
    source_id: id,
    parent_run_id: null,
    child_chat_id: child.id,
    device_id: null,
    runtime: null,
    session_id: null,
    job_id: null,
    source_generation: null,
    source_seq: 0,
    source_revision: 0,
    title: 'Helper',
    task: 'Look into it',
    state,
    last_known_state: null,
    observability_reason: null,
    progress: null,
    result: null,
    error: null,
    model: null,
    effort: null,
    cwd: null,
    started_at: null,
    updated_at: '2026-10-17T09:00:00.000Z',
    completed_at: null,
    usage: null,
    supported_actions: [],
    truncated: false,
  };
}

function removal(
  child: AiChatRow,
  runId: string,
  status: EngineStatus['state'],
): Parameters<typeof admitInactiveRemoval>[0] {
  return {
    store: rig.opened.store,
    owner: rig.owner,
    chatId: child.id,
    runId,
    status: () => ({ state: status, reason: null }),
  };
}

describe('removing a finished subagent conversation', () => {
  it('is allowed once the child has nothing running', () => {
    const parent = rig.newChat(rig.desk.target);
    const child = rig.newChat(rig.desk.target);
    const finished = rig.opened.store.aiAgentRuns.upsert(run(parent, child, 'completed'));

    expect(() => {
      admitInactiveRemoval(removal(child, finished.id, 'ready'), [child]);
    }).not.toThrow();
  });

  it('is allowed when the machine running the child is offline', () => {
    const parent = rig.newChat(rig.desk.target);
    const child = rig.newChat(rig.desk.target);
    const finished = rig.opened.store.aiAgentRuns.upsert(run(parent, child, 'completed'));

    expect(() => {
      admitInactiveRemoval(removal(child, finished.id, 'unavailable'), [child]);
    }).not.toThrow();
  });

  it('is allowed when the engine reports no status', () => {
    const parent = rig.newChat(rig.desk.target);
    const child = rig.newChat(rig.desk.target);
    const finished = rig.opened.store.aiAgentRuns.upsert(run(parent, child, 'completed'));

    expect(() => {
      admitInactiveRemoval({ ...removal(child, finished.id, 'ready'), status: () => null }, [
        child,
      ]);
    }).not.toThrow();
  });

  it('is refused while the child is still working', () => {
    const parent = rig.newChat(rig.desk.target);
    const child = rig.newChat(rig.desk.target);
    const finished = rig.opened.store.aiAgentRuns.upsert(run(parent, child, 'completed'));

    expect(() => {
      admitInactiveRemoval(removal(child, finished.id, 'working'), [child]);
    }).toThrow(/still working/u);
  });

  it('is refused while another run of the child has not finished', () => {
    const parent = rig.newChat(rig.desk.target);
    const child = rig.newChat(rig.desk.target);
    const finished = rig.opened.store.aiAgentRuns.upsert(run(parent, child, 'completed'));
    rig.opened.store.aiAgentRuns.upsert(run(parent, child, 'running'));

    expect(() => {
      admitInactiveRemoval(removal(child, finished.id, 'ready'), [child]);
    }).toThrow(/still working/u);
  });

  it('is refused when the run named belongs to another conversation', () => {
    const parent = rig.newChat(rig.desk.target);
    const child = rig.newChat(rig.desk.target);
    const other = rig.newChat(rig.desk.target);
    const finished = rig.opened.store.aiAgentRuns.upsert(run(parent, other, 'completed'));

    expect(() => {
      admitInactiveRemoval(removal(child, finished.id, 'ready'), [child]);
    }).toThrow(/does not belong/u);
  });
});
