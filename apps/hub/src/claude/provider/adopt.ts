import { forkSession, getSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import type { ComputerAiExecute } from '@smarteverything/domain';
import { ProviderInputError } from './input';
import type { ProviderSessions } from './sessions';
import { workDirectory } from './options';

type AdoptRequest = Extract<ComputerAiExecute, { operation: 'provider_adopt' }>;

export async function adoptSession(
  sessions: ProviderSessions,
  directory: string,
  request: AdoptRequest,
): Promise<string> {
  const cwd = await workDirectory(directory, { cwd: request.cwd, builtin_tools: [] });
  await sessions.available(request.session_id);
  if ((await getSessionInfo(request.session_id, { dir: cwd })) === undefined)
    throw new ProviderInputError(
      'This Claude session was not found in its folder on this computer.',
    );
  const forked = await forkSession(request.session_id, { dir: cwd });
  await sessions.remember({
    session_id: forked.sessionId,
    chat_id: request.chat_id,
    profile_id: request.profile_id,
    cwd,
  });
  return forked.sessionId;
}
