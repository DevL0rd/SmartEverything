import {
  SCHEDULED_AI_STEPS_REASON,
  type ScheduleRow,
  type ScheduleStep,
} from '@smarteverything/domain';
import type { ToolCaller } from '../ai-tools/hub-tool';
import type { ToolHub } from '../ai-tools/tool-hub';
import { describeError } from '../commands/executor';
import type { Store } from '../store/store';

export interface AiTurnInput {
  readonly profileId: string;
  readonly chatId: string | null;
  readonly title: string;
  readonly text: string;
}

export interface AiTurns {
  readonly run: (input: AiTurnInput) => Promise<{ readonly chatId: string }>;
}

export interface StepOutcome {
  readonly outcome: 'ok' | 'failed';
  readonly line: string;
  readonly detail: string | null;
}

type RunnableStep = Exclude<ScheduleStep, { kind: 'wait' }>;

export const DEFAULT_SCHEDULE_TITLE = 'Scheduled';

class RemovedDeviceError extends Error {
  override readonly name = 'RemovedDeviceError';

  constructor() {
    super('It was scheduled from a device that has since been removed.');
  }
}

function failed(line: string, detail: string): StepOutcome {
  return { outcome: 'failed', line, detail };
}

export class StepRunner {
  constructor(
    private readonly tools: ToolHub,
    private readonly store: Pick<Store, 'clients'>,
    private readonly ai: AiTurns | null,
  ) {}

  isRepeatable(step: ScheduleStep): boolean {
    if (step.kind !== 'tool') {
      return true;
    }
    const check = this.tools.check(step.tool, step.args);
    return check.ok && check.tool.annotations.readOnlyHint;
  }

  async run(step: RunnableStep, row: ScheduleRow, line: string): Promise<StepOutcome> {
    try {
      return step.kind === 'tool'
        ? await this.tool(step, row, line)
        : await this.aiTurn(step, row, line);
    } catch (cause) {
      return failed(line, describeError(cause));
    }
  }

  private callerOf(row: ScheduleRow): ToolCaller {
    if (row.client_id === null) {
      throw new RemovedDeviceError();
    }
    const client = this.store.clients.byId(row.client_id);
    return {
      profileId: row.profile_id,
      role: client.role,
      chatId: null,
      via: 'schedule',
      confirmed: row.confirmed_at !== null,
      clientId: client.id,
    };
  }

  private async tool(
    step: Extract<ScheduleStep, { kind: 'tool' }>,
    row: ScheduleRow,
    line: string,
  ): Promise<StepOutcome> {
    const result = await this.tools.call(step.tool, step.args, this.callerOf(row));
    const error = result.response['error'];
    if (typeof error === 'string') {
      return failed(line, error);
    }
    if (result.response['needs_confirmation'] !== undefined) {
      return failed(line, 'It needs a confirmation it did not get when it was scheduled.');
    }
    return { outcome: 'ok', line: result.line === '' ? line : result.line, detail: null };
  }

  private async aiTurn(
    step: Extract<ScheduleStep, { kind: 'ai' }>,
    row: ScheduleRow,
    line: string,
  ): Promise<StepOutcome> {
    if (this.ai === null) {
      return failed(line, SCHEDULED_AI_STEPS_REASON);
    }
    const turn = await this.ai.run({
      profileId: row.profile_id,
      chatId: step.chatId,
      title: row.label ?? DEFAULT_SCHEDULE_TITLE,
      text: step.prompt,
    });
    return { outcome: 'ok', line, detail: `chat ${turn.chatId}` };
  }
}
