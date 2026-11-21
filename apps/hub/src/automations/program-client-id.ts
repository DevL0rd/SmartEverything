import { ApiError, type AutomationProgramReply } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { profileIdOf, type Caller } from '../server/auth';
import type { AutomationProgramsRepository } from '../store/repositories/automation-programs';
import { reply } from './service-programs-analysis';

const log = new Logger('hub.automations');

export function alreadyMade(
  programs: Pick<AutomationProgramsRepository, 'find'>,
  caller: Caller,
  id: string | undefined,
): AutomationProgramReply | undefined {
  const made = id === undefined ? undefined : programs.find(id);
  if (made === undefined) return undefined;
  if (made.author?.profile_id !== profileIdOf(caller)) {
    throw new ApiError('forbidden', 'That automation belongs to someone else.');
  }
  log.debug('automation.duplicate_create_ignored', { automationId: made.id });
  const summary = `Already saved as revision ${String(made.revision)}.`;
  return reply(true, summary, { id: made.id, revision: made.revision }, []);
}
