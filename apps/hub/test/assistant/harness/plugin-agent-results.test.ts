import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiAgentRun, AiChatRow } from '@smarteverything/domain';
import { helperResult } from '../../../src/harness/plugin-agents';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function helperRun(
  parent: AiChatRow,
  child: AiChatRow,
  update: Pick<AiAgentRun, 'state' | 'result'>,
  id: string = randomUUID(),
): AiAgentRun {
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
    last_known_state: null,
    observability_reason: null,
    progress: null,
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
    ...update,
  };
}

describe('the result of a helper started by a chat on another computer', () => {
  it('is handed back to the chat that started it once the helper has finished', async () => {
    const parent = rig.newChat(rig.desk.target);
    const child = rig.newChat(rig.desk.target);
    const run = rig.opened.store.aiAgentRuns.upsert(
      helperRun(parent, child, { state: 'running', result: null }),
    );

    const pending = helperResult(rig.service, { parent: parent.id, run: run.id }, undefined);
    rig.opened.store.aiAgentRuns.upsert({
      ...run,
      source_revision: 1,
      state: 'completed',
      result: 'All done',
    });

    await expect(pending).resolves.toMatchObject({
      child_id: child.id,
      run_id: run.id,
      state: 'completed',
      text: 'All done',
    });
  });

  it('is refused to a chat that did not start the helper', async () => {
    const parent = rig.newChat(rig.desk.target);
    const other = rig.newChat(rig.desk.target);
    const child = rig.newChat(rig.desk.target);
    const run = rig.opened.store.aiAgentRuns.upsert(
      helperRun(parent, child, { state: 'completed', result: 'Private' }),
    );

    await expect(
      helperResult(rig.service, { parent: other.id, run: run.id }, undefined),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
