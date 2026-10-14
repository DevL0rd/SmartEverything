import type { z } from 'zod';
import type { CODEX_PROVIDER_CONTROL, CODEX_PROVIDER_READ_QUERY } from '@smarteverything/domain';
import { JSON_VALUE } from '@smarteverything/domain';
import { type CodexSessions, toolSignature } from './sessions';
import type { CodexJob } from './job';
import { CodexRuntimeError } from './errors';
import { readWorkspaceFile } from './files';
import { THREAD_REPLY } from './protocol';
export async function providerRead(
  job: CodexJob,
  query: z.infer<typeof CODEX_PROVIDER_READ_QUERY>,
  sessions: CodexSessions,
): Promise<z.infer<typeof JSON_VALUE>> {
  switch (query.kind) {
    case 'context':
      return {
        device_id: job.turn.device_id,
        runtime: 'codex',
        session_id: job.threadId,
        process_generation: job.generation,
        cwd: job.cwd,
        workspace_roots: [job.cwd, ...job.roots],
      };
    case 'usage':
      return job.usage;
    case 'tasks':
      return JSON_VALUE.parse(job.agents.list());
    case 'file':
      return readWorkspaceFile(job.cwd, job.roots, query.path, query.max_bytes);
    case 'mcp_status':
      return JSON_VALUE.parse(
        await job.client.request('mcpServerStatus/list', {
          threadId: job.threadId,
          limit: 100,
          detail: 'toolsAndAuthOnly',
        }),
      );
    case 'sessions':
      return sessions
        .list(job.turn.chat_id, job.turn.profile_id)
        .slice(0, query.limit)
        .map((entry) => ({ ...entry }));
    case 'session_messages': {
      await sessions.check(query.session_id, job.turn.chat_id, job.turn.profile_id, job.cwd);
      return JSON_VALUE.parse(
        await job.client.request('thread/items/list', {
          threadId: query.session_id,
          limit: query.limit,
        }),
      );
    }
  }
}
export async function providerControl(
  job: CodexJob,
  control: z.infer<typeof CODEX_PROVIDER_CONTROL>,
  sessions: CodexSessions,
): Promise<z.infer<typeof JSON_VALUE>> {
  if (control.action === 'close') return close(job);
  if (job.active)
    throw new CodexRuntimeError(
      control.action,
      'Change Codex session settings only after the current turn has finished.',
    );
  if (control.action === 'set_model' || control.action === 'set_options')
    throw new CodexRuntimeError(
      control.action,
      'Change the chat engine model, effort and options for the next turn; this adapter does not mutate a saved engine through a provider control.',
    );
  await sessions.check(control.session_id, job.turn.chat_id, job.turn.profile_id, job.cwd);
  if (control.action === 'rename_session') {
    await job.client.request('thread/name/set', {
      threadId: control.session_id,
      name: control.title,
    });
    return { renamed: true };
  }
  if (control.action === 'fork_session') {
    const fork = THREAD_REPLY.parse(
      await job.client.request('thread/fork', { threadId: control.session_id }),
    );
    await sessions.remember({
      session_id: fork.thread.id,
      chat_id: job.turn.chat_id,
      profile_id: job.turn.profile_id,
      cwd: job.cwd,
      workspace_roots: [job.cwd, ...job.roots],
      tool_signature: toolSignature(job.turn),
    });
    return { session_id: fork.thread.id };
  }
  const methods = {
    archive_session: 'thread/archive',
    unarchive_session: 'thread/unarchive',
    delete_session: 'thread/delete',
  } as const;
  await job.client.request(methods[control.action], { threadId: control.session_id });
  if (control.action === 'delete_session') await sessions.forget(control.session_id);
  return { acknowledged: true };
}

async function close(job: CodexJob): Promise<z.infer<typeof JSON_VALUE>> {
  if (job.active)
    throw new CodexRuntimeError(
      'close',
      'Interrupt active Codex work and wait for its terminal event before closing.',
    );
  await job.client.request('thread/unsubscribe', { threadId: job.threadId });
  job.prompts.expire();
  return { closed: true };
}
