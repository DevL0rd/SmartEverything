import { executionRole, withExecutionAuthority } from '../assistant/turn-authority';
import { hasOwnerDevice } from '../server/person-access';
import { effectAuthority, withEffectTool } from '../harness/effect-authority';
import type { PluginOrigin, ScheduleRow, ScheduleStep } from '@smarteverything/domain';
import type { ToolCaller } from '../ai-tools/hub-tool';
import { limitsOf } from '../ai-tools/plugin-turn';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Store } from '../store/store';
import { failureLine } from '@smarteverything/logging';

export const NO_AI_ENGINE = 'No AI chat engine is set up';

interface AiTurnInput {
  readonly profileId: string;
  readonly chatId: string | null;
  readonly title: string;
  readonly text: string;
  readonly plugin: PluginOrigin | null;
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

const DEFAULT_SCHEDULE_TITLE = 'Scheduled';

function failed(line: string, detail: string): StepOutcome {
  return { outcome: 'failed', line, detail };
}

export class StepRunner {
  constructor(
    private readonly tools: ToolHub,
    private readonly store: Store,
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
      return failed(line, failureLine(cause));
    }
  }

  private callerOf(row: ScheduleRow): ToolCaller {
    const authority = effectAuthority(this.store, 'schedule', row.id);
    if (authority !== undefined)
      return {
        authority,
        profileId: authority.profile_id,
        role: executionRole(authority),
        chatId: this.store.assistantEvents.event(authority.event_id).chat_id,
        clientId: authority.client_id,
        via: 'schedule',
        ...limitsOf(authority.requester ?? undefined, authority.plugin_id ?? undefined),
      };
    return {
      profileId: row.profile_id,
      role: hasOwnerDevice(this.store, row.profile_id) ? 'owner' : 'member',
      chatId: null,
      via: 'schedule',
      clientId: null,
      ...limitsOf(row.origin?.requester, row.origin?.plugin_id),
    };
  }

  private async tool(
    step: Extract<ScheduleStep, { kind: 'tool' }>,
    row: ScheduleRow,
    line: string,
  ): Promise<StepOutcome> {
    const result = await withEffectTool(
      this.store,
      effectAuthority(this.store, 'schedule', row.id),
      step.tool,
      () => this.tools.call(step.tool, step.args, this.callerOf(row)),
    );
    const error = result.response['error'];
    if (typeof error === 'string') {
      return failed(line, error);
    }
    return { outcome: 'ok', line: result.line === '' ? line : result.line, detail: null };
  }

  private async aiTurn(
    step: Extract<ScheduleStep, { kind: 'ai' }>,
    row: ScheduleRow,
    line: string,
  ): Promise<StepOutcome> {
    if (this.ai === null) {
      return failed(line, NO_AI_ENGINE);
    }
    const ai = this.ai;
    const turn = await withExecutionAuthority(effectAuthority(this.store, 'schedule', row.id), () =>
      ai.run({
        profileId: row.profile_id,
        chatId: step.chatId,
        title: row.label ?? DEFAULT_SCHEDULE_TITLE,
        text: step.prompt,
        plugin: row.origin,
      }),
    );
    return { outcome: 'ok', line, detail: `chat ${turn.chatId}` };
  }
}
