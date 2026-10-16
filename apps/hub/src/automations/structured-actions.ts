import {
  ApiError,
  type Action,
  type AutomationBindingContext,
  type AutomationValueOperation,
  type Conditions,
  type JsonValue,
  type StructuredAction,
  type GroupCommand,
  type CommandRow,
  type TargetCommandAction,
} from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { ActionOrigin } from './actions';
import { admitRun, runDelay, type ActionExecutionContext } from './run-context';

export interface StructuredActionServices {
  readonly temporaryEffect?: (
    action: Extract<StructuredAction, { type: 'temporary_effect' }>,
    context: ActionExecutionContext,
    parameters: Readonly<Record<string, JsonValue>>,
  ) => Promise<string | null>;
  readonly bindingContext: (
    parameters: Readonly<Record<string, JsonValue>>,
  ) => AutomationBindingContext;
  readonly conditions: (
    conditions: Conditions,
    parameters: Readonly<Record<string, JsonValue>>,
  ) => boolean;
  readonly value: (id: string, operation: AutomationValueOperation) => void;
  readonly sequence: (
    action: Extract<StructuredAction, { type: 'sequence' }>,
    origin: ActionOrigin,
    context: ActionExecutionContext,
    parameters: Readonly<Record<string, JsonValue>>,
  ) => Promise<void>;
  readonly stop: (
    target: Extract<StructuredAction, { type: 'stop' }>['target'],
    context: ActionExecutionContext,
  ) => void;
  readonly targetCommand?: (
    action: TargetCommandAction,
    context: ActionExecutionContext,
    parameters: Readonly<Record<string, JsonValue>>,
    issue: (
      commands: readonly GroupCommand[],
      admitted?: boolean,
    ) => Promise<readonly CommandRow[]>,
  ) => Promise<string | null>;
  readonly command: (
    action: Extract<StructuredAction, { type: 'command' }>,
    context: ActionExecutionContext,
    parameters: Readonly<Record<string, JsonValue>>,
    issue: (value: JsonValue) => Promise<void>,
  ) => Promise<void>;
}
export interface StructuredExecution {
  readonly services: StructuredActionServices;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly context: ActionExecutionContext;
  readonly origin: ActionOrigin;
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly block: (
    actions: readonly Action[],
    path: string,
    context: ActionExecutionContext,
  ) => Promise<void>;
}
export async function runStructuredAction(
  action: Exclude<StructuredAction, { type: 'command' | 'target_command' | 'temporary_effect' }>,
  execution: StructuredExecution,
  path: string,
): Promise<void> {
  const { services, context, origin, parameters } = execution;
  switch (action.type) {
    case 'value_update':
      services.value(action.valueId, action.operation);
      return;
    case 'sequence':
      await services.sequence(action, origin, context, parameters);
      return;
    case 'stop':
      services.stop(action.target, context);
      admitRun(context);
      return;
    case 'choose': {
      const branch = action.branches.find((candidate) =>
        services.conditions(candidate.conditions, parameters),
      );
      if (branch !== undefined)
        await execution.block(branch.actions, `${path}/${branch.nodeId}`, context);
      else if (action.otherwise !== undefined)
        await execution.block(action.otherwise, `${path}/otherwise`, context);
      return;
    }
    case 'repeat':
      await runRepeat(action, execution, path);
      return;
  }
}
async function runRepeat(
  action: Extract<StructuredAction, { type: 'repeat' }>,
  execution: StructuredExecution,
  path: string,
): Promise<void> {
  const { context, clock, services } = execution;
  const deadline = clock.now().getTime() + action.maximumDurationMs;
  for (let iteration = 0; ; iteration += 1) {
    admitRun(context);
    if (clock.now().getTime() >= deadline)
      throw new ApiError('command_refused', 'Repeat reached its maximum duration.');

    if (
      action.repeat.mode === 'while' &&
      !services.conditions(action.repeat.conditions, execution.parameters)
    )
      return;
    await boundedBlock(execution, action.actions, `${path}/body`, deadline);
    admitRun(context);
    if (
      action.repeat.mode === 'until' &&
      services.conditions(action.repeat.conditions, execution.parameters)
    )
      return;
    if (action.repeat.mode === 'count' && iteration + 1 >= action.repeat.count) return;
    await runDelay(
      clock,
      Math.min(action.intervalMs, Math.max(0, deadline - clock.now().getTime())),
      context,
    );
  }
}
async function boundedBlock(
  execution: StructuredExecution,
  actions: readonly Action[],
  path: string,
  deadline: number,
): Promise<void> {
  const controller = new AbortController();
  const parent = execution.context;
  const abort = (): void => {
    controller.abort();
  };
  parent.signal.addEventListener('abort', abort, { once: true });
  if (parent.signal.aborted) abort();
  const cancel = execution.clock.at(new Date(deadline), abort);
  const context = { ...parent, signal: controller.signal };
  try {
    await execution.block(actions, path, context);
  } finally {
    cancel();
    parent.signal.removeEventListener('abort', abort);
  }
}
