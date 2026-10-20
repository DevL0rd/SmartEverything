import type {
  AutomationProgramProblem,
  AutomationProgramReply,
  AutomationV3,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { createProgram, setProgramEnabled } from '../features/automations/data/api';

const log = new Logger('app.automations');

export class AutomationRefusedError extends Error {
  override readonly name = 'AutomationRefusedError';

  constructor(
    readonly problems: readonly AutomationProgramProblem[],
    summary: string,
  ) {
    super(summary);
  }
}

function accepted(reply: AutomationProgramReply): AutomationProgramReply {
  if (!reply.ok) {
    throw new AutomationRefusedError(reply.problems, reply.summary);
  }
  return reply;
}

export async function setAutomationEnabled(automationId: string, enabled: boolean): Promise<void> {
  accepted(await setProgramEnabled(automationId, enabled));
  log.info('automation.toggled', { automationId, enabled });
}

export interface AutomationCreate {
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: AutomationV3;
}

export async function createAutomation(create: AutomationCreate): Promise<AutomationProgramReply> {
  const reply = accepted(await createProgram(create));
  log.info('automation.created', { automationId: reply.id });
  return reply;
}
