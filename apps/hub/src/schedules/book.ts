import {
  ApiError,
  SCHEDULED_AI_STEPS_REASON,
  isScheduleActive,
  type ScheduleRow,
  type ScheduleSaved,
  type ScheduleStep,
  type ScheduleTiming,
} from '@smarteverything/domain';
import type { Clock } from '../clock';
import { recordArgument } from '../ai-tools/arguments';
import { needsConfirmation } from '../ai-tools/confirmation';
import { deviceIdsIn, toolLine } from '../ai-tools/tool-lines';
import type { ToolHub } from '../ai-tools/tool-hub';
import { META_TOOL_NAMES } from '../ai-tools/tool-sets';
import type { ScheduleChange } from '../store/repositories/schedules';
import type { Store } from '../store/store';
import { occurrencesOf } from './timing';

const PROMPT_LINE = 120;

export interface ScheduleAuthor {
  readonly profileId: string;
  readonly clientId: string;
  readonly role: 'owner' | 'member';
  readonly via: ScheduleRow['via'];
}

export interface NewScheduleInput {
  readonly label: string | null;
  readonly timing: ScheduleTiming;
  readonly steps: readonly ScheduleStep[];
  readonly confirm: boolean;
}

export interface ScheduleEdit {
  readonly label?: string | null | undefined;
  readonly timing?: ScheduleTiming | undefined;
  readonly steps?: readonly ScheduleStep[] | undefined;
  readonly confirm: boolean;
}

interface CheckedSteps {
  readonly lines: (string | null)[];
  readonly deviceIds: string[];
  readonly ask: { index: number; line: string }[];
}

interface StepCheck {
  readonly line: string | null;
  readonly deviceIds: readonly string[];
  readonly ask: boolean;
}

export function stepLineOf(row: ScheduleRow, index: number): string {
  const step = row.steps[index];
  return row.step_lines[index] ?? (step?.kind === 'ai' ? step.prompt : 'Step');
}

export class ScheduleBook {
  constructor(
    private readonly store: Store,
    private readonly tools: ToolHub,
    private readonly clock: Pick<Clock, 'now'>,
    private readonly aiReady: boolean,
  ) {}

  create(author: ScheduleAuthor, input: NewScheduleInput): ScheduleSaved {
    const checked = this.checkSteps(input.steps, author);
    if (checked.ask.length > 0 && !input.confirm) {
      return needsConfirmationOf(checked);
    }
    const now = this.clock.now();
    const confirmed = checked.ask.length > 0;
    const schedule = this.store.schedules.create({
      profileId: author.profileId,
      clientId: author.clientId,
      via: author.via,
      label: input.label,
      timing: input.timing,
      occurrences: occurrencesOf(input.timing, now, this.store.settings.read().time_zone),
      steps: input.steps,
      stepLines: checked.lines,
      deviceIds: checked.deviceIds,
      confirmedAt: confirmed ? now.toISOString() : null,
      confirmedBy: confirmed ? author.profileId : null,
    });
    return { outcome: 'scheduled', schedule };
  }

  update(author: ScheduleAuthor, id: string, edit: ScheduleEdit): ScheduleSaved {
    const row = this.managed(author, id);
    if (!isScheduleActive(row.state) || row.state === 'running') {
      throw new ApiError('conflict', 'Only a scheduled action that is waiting to run can change.');
    }
    let change: ScheduleChange = edit.label === undefined ? {} : { label: edit.label };
    if (edit.steps !== undefined) {
      const checked = this.checkSteps(edit.steps, author);
      if (checked.ask.length > 0 && !edit.confirm) {
        return needsConfirmationOf(checked);
      }
      change = { ...change, ...this.stepsChange(row, edit.steps, checked, author) };
    }
    if (edit.timing !== undefined) {
      change = { ...change, ...this.timingChange(edit.timing) };
    }
    return { outcome: 'scheduled', schedule: this.store.schedules.update(id, change) };
  }

  remove(author: ScheduleAuthor, id: string): void {
    const row = this.managed(author, id);
    if (isScheduleActive(row.state)) {
      throw new ApiError('conflict', 'Cancel it first; only finished actions can be removed.');
    }
    this.store.schedules.remove(id);
  }

  managed(author: ScheduleAuthor, id: string): ScheduleRow {
    const row = this.store.schedules.byId(id);
    if (author.role !== 'owner' && row.profile_id !== author.profileId) {
      throw new ApiError(
        'forbidden',
        'Only the person who scheduled it or an owner can change it.',
      );
    }
    return row;
  }

  private stepsChange(
    row: ScheduleRow,
    steps: readonly ScheduleStep[],
    checked: CheckedSteps,
    author: ScheduleAuthor,
  ): ScheduleChange {
    const confirmed = checked.ask.length > 0;
    return {
      steps,
      stepLines: checked.lines,
      deviceIds: checked.deviceIds,
      step: Math.min(row.step, steps.length),
      confirmedAt: confirmed ? this.clock.now().toISOString() : null,
      confirmedBy: confirmed ? author.profileId : null,
    };
  }

  private timingChange(timing: ScheduleTiming): ScheduleChange {
    const occurrences = occurrencesOf(
      timing,
      this.clock.now(),
      this.store.settings.read().time_zone,
    );
    return {
      timing,
      occurrences,
      occurrence: 0,
      step: 0,
      state: 'scheduled',
      nextAt: occurrences[0] ?? null,
    };
  }

  private checkSteps(steps: readonly ScheduleStep[], author: ScheduleAuthor): CheckedSteps {
    const problems: string[] = [];
    const checked: CheckedSteps = { lines: [], deviceIds: [], ask: [] };
    steps.forEach((step, index) => {
      try {
        const result = this.checkStep(step, author);
        checked.lines.push(result.line);
        checked.deviceIds.push(...result.deviceIds.filter((id) => !checked.deviceIds.includes(id)));
        if (result.ask) {
          checked.ask.push({ index, line: result.line ?? 'Step' });
        }
      } catch (cause) {
        problems.push(
          `Step ${String(index + 1)}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    });
    if (problems.length > 0) {
      throw new ApiError('invalid_request', problems.join(' '));
    }
    return checked;
  }

  private checkStep(step: ScheduleStep, author: ScheduleAuthor): StepCheck {
    switch (step.kind) {
      case 'wait':
        return { line: null, deviceIds: [], ask: false };
      case 'ai':
        if (!this.aiReady) {
          throw new Error(SCHEDULED_AI_STEPS_REASON);
        }
        return { line: step.prompt.slice(0, PROMPT_LINE), deviceIds: [], ask: false };
      case 'tool':
        return this.checkTool(step, author);
    }
  }

  private checkTool(
    step: Extract<ScheduleStep, { kind: 'tool' }>,
    author: ScheduleAuthor,
  ): StepCheck {
    const check = this.tools.check(step.tool, step.args);
    if (!check.ok) {
      throw new Error(check.reason);
    }
    const args =
      step.tool === META_TOOL_NAMES.call ? recordArgument(step.args, 'arguments') : step.args;
    if (check.tool.humanOnly && author.via !== 'app') {
      throw new Error(`Only a person can schedule ${check.tool.title}.`);
    }
    const names = new Map(
      this.store.devices.list().map((device) => [device.id, device.display_name ?? device.name]),
    );
    return {
      line: toolLine({
        tool: check.tool,
        args,
        failed: false,
        deviceName: (id) => names.get(id) ?? null,
      }),
      deviceIds: deviceIdsIn(args).filter((id) => names.has(id)),
      ask: needsConfirmation(check.tool, args),
    };
  }
}

function needsConfirmationOf(checked: CheckedSteps): ScheduleSaved {
  return {
    outcome: 'needs_confirmation',
    reason: 'Ask the person to confirm these steps, then send the same request with confirm: true.',
    steps: checked.ask,
  };
}
