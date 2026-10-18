import { getSessionInfo, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import type { ComputerAiRead, JsonValue } from '@smarteverything/domain';
import { connectionReadRequest, connectionRead } from './runtime-reads';
import { jsonOf } from './control';
import type { ProviderJob } from './job';
import type { ProviderSessions } from './sessions';

type Query = Extract<ComputerAiRead, { operation: 'provider_read' }>['query'];

export async function readProvider(
  job: ProviderJob,
  request: Query,
  sessions: ProviderSessions,
  checkSession: (job: ProviderJob, sessionId: string) => void,
): Promise<JsonValue> {
  if (connectionReadRequest(request)) return connectionRead(job, request);
  switch (request.kind) {
    case 'context':
      return jsonOf(await job.query.getContextUsage({ detail: request.detail }));
    case 'usage':
      return jsonOf(
        await job.query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
          skipBehaviors: request.skip_behaviors,
        }),
      );
    case 'file':
      return jsonOf(
        await job.query.readFile(request.path, {
          maxBytes: request.max_bytes,
          encoding: request.encoding,
        }),
      );
    case 'tasks':
      return job.tasks();
    case 'task_output':
      return job.taskOutput(request.task_id);
    case 'sessions':
      return jsonOf(
        sessions
          .list(job.options.turn.chat_id, job.options.turn.profile_id)
          .slice(0, request.limit),
      );
    case 'session_info':
      checkSession(job, request.session_id);
      return jsonOf(await getSessionInfo(request.session_id, { dir: job.options.cwd }));
    case 'session_messages':
      checkSession(job, request.session_id);
      return jsonOf(
        await getSessionMessages(request.session_id, {
          dir: job.options.cwd,
          limit: request.limit,
        }),
      );
  }
}
