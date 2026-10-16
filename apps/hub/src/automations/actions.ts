import { CAPABILITY_KEY } from '@smarteverything/domain';
import { runStructuredAction, type StructuredActionServices } from './structured-actions';
import { describeError } from '../commands/executor';
import {
  AutomationRunClockError,
  admitRun,
  awaitRun,
  runDelay,
  type ActionExecutionContext,
} from './run-context';
import type {
  Action,
  LegacyAction,
  CommandAction,
  PluginOrigin,
  SignalInput,
  JsonValue,
} from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { CommandInsert, CommandRow, HubDatabase } from '../database/port';
import type { AutomationAiSlot } from './automation-ai';

export interface ActionOrigin {
  readonly automationId: string;
  readonly targetType?: 'automation' | 'sequence';
  readonly name: string;
  readonly signal: SignalInput | null;
  readonly plugin: PluginOrigin | null;
}
export interface ActionRunnerOptions {
  readonly structured?: StructuredActionServices;
  readonly store: Pick<HubDatabase, 'insertCommands'> & Partial<Pick<HubDatabase, 'finishCommand'>>;
  readonly submit: (
    rows: readonly CommandRow[],
    admitted?: boolean,
    authorize?: () => void,
  ) => void | Promise<void>;
  readonly sceneActions: (sceneId: string) => readonly CommandAction[] | undefined;
  readonly notify: (origin: ActionOrigin, message: string) => void;
  readonly ai: AutomationAiSlot;
  readonly clock: Pick<Clock, 'sleep'> & Partial<Pick<Clock, 'now' | 'at'>>;
  readonly withOrigin?: (origin: ActionOrigin, work: () => Promise<void>) => Promise<void>;
}
interface Execution {
  readonly origin: ActionOrigin;
  readonly context: ActionExecutionContext | undefined;
  readonly admit: (() => void) | undefined;
  readonly path: string;
  readonly parameters: Readonly<Record<string, JsonValue>>;
}
export class UnknownSceneError extends Error {
  override readonly name = 'UnknownSceneError';
  constructor(sceneId: string) {
    super(`Scene ${sceneId} does not exist in this home.`);
  }
}
function commandOf(action: CommandAction, source: CommandInsert['source']): CommandInsert {
  return { deviceId: action.deviceId, capability: action.capability, value: action.value, source };
}
function authorize(execution: Execution): void {
  admitRun(execution.context);
  execution.admit?.();
}
function stepId(action: Action, index: number, path: string): string | number {
  if (action.nodeId !== undefined) return action.nodeId;
  return path === '' ? index : `${path}/${String(index)}`;
}
export class ActionRunner {
  constructor(private readonly options: ActionRunnerOptions) {}
  async runScene(sceneId: string, context?: ActionExecutionContext): Promise<void> {
    const actions =
      context === undefined ? this.options.sceneActions(sceneId) : context.sceneActions(sceneId);
    if (actions === undefined) throw new UnknownSceneError(sceneId);
    await this.issue(
      actions.map((action) => commandOf(action, 'scene')),
      context,
    );
  }
  run(
    actions: readonly Action[],
    origin: ActionOrigin,
    admit?: () => void,
    context?: ActionExecutionContext,
  ): Promise<void> {
    return this.execute(actions, { origin, context, admit, path: '', parameters: {} });
  }
  runWithParameters(
    actions: readonly Action[],
    origin: ActionOrigin,
    context: ActionExecutionContext,
    parameters: Readonly<Record<string, JsonValue>>,
  ): Promise<void> {
    return this.execute(actions, { origin, context, admit: undefined, path: '', parameters });
  }
  private execute(actions: readonly Action[], execution: Execution): Promise<void> {
    const work = (): Promise<void> => this.runActions(actions, execution);
    return this.options.withOrigin === undefined
      ? work()
      : this.options.withOrigin(execution.origin, work);
  }
  private async runActions(actions: readonly Action[], execution: Execution): Promise<void> {
    for (const [index, action] of actions.entries()) {
      authorize(execution);
      await this.runStep(
        action,
        { ...execution, path: String(stepId(action, index, execution.path)) },
        stepId(action, index, execution.path),
      );
    }
  }
  private async runStep(
    action: Action,
    execution: Execution,
    node: string | number,
  ): Promise<void> {
    const { context } = execution;
    context?.step(node, 'running', null);
    try {
      const work = this.runOne(action, execution);
      const cancellable = [
        'delay',
        'scene',
        'command',
        'target_command',
        'notify',
        'wake_ai',
        'tool',
      ];
      const note = await (context !== undefined && cancellable.includes(action.type)
        ? awaitRun(work, context)
        : work);
      authorize(execution);
      context?.step(node, 'succeeded', note);
    } catch (cause) {
      context?.step(node, context.signal.aborted ? 'cancelled' : 'failed', describeError(cause));
      throw cause;
    }
  }
  private async runOne(action: Action, execution: Execution): Promise<string | null> {
    if (action.type === 'target_command') {
      const { context, parameters } = execution;
      const service = this.structured(context).targetCommand;
      if (context === undefined || service === undefined)
        throw new AutomationRunClockError('target command');
      return service(action, context, parameters, (commands, admitted) =>
        this.issue(
          commands.map((command) => ({
            deviceId: command.device_id,
            capability: CAPABILITY_KEY.parse(command.capability),
            value: command.value,
            source: 'automation',
          })),
          context,
          admitted,
        ),
      );
    }
    if (action.type === 'temporary_effect') return this.temporary(action, execution);
    if (
      action.type === 'choose' ||
      action.type === 'repeat' ||
      action.type === 'sequence' ||
      action.type === 'value_update' ||
      action.type === 'stop'
    ) {
      await this.structuredStep(action, execution);
      return null;
    }
    await this.legacyAction(action, execution);
    return null;
  }
  private temporary(
    action: Extract<Action, { type: 'temporary_effect' }>,
    execution: Execution,
  ): Promise<string | null> {
    const service = this.structured(execution.context).temporaryEffect;
    if (execution.context === undefined || service === undefined)
      throw new AutomationRunClockError('temporary change');
    return service(action, execution.context, execution.parameters);
  }
  private async legacyAction(
    action: LegacyAction | Extract<Action, { type: 'command' }>,
    execution: Execution,
  ): Promise<void> {
    const { origin, context } = execution;
    switch (action.type) {
      case 'command':
        await this.command(action, execution);
        return;
      case 'scene':
        await this.runScene(action.sceneId, context);
        return;
      case 'delay':
        await this.delay(action.seconds, context);
        return;
      case 'notify':
        this.options.notify(origin, action.message);
        return;
      case 'wake_ai':
        await this.options.ai.current().wake(action, origin);
        return;
      case 'tool':
        await this.options.ai.current().tool(action, origin);
        return;
    }
  }
  private async command(
    action: Extract<Action, { type: 'command' }>,
    execution: Execution,
  ): Promise<void> {
    const { context, parameters } = execution;
    if (!('binding' in action)) {
      await this.issue([commandOf(action, 'automation')], context);
      return;
    }
    const services = this.structured(context);
    if (context === undefined) throw new AutomationRunClockError('structured action');
    await services.command(action, context, parameters, async (value): Promise<void> => {
      await this.issue([commandOf({ ...action, value }, 'automation')], context, true);
    });
  }
  private async delay(seconds: number, context: ActionExecutionContext | undefined): Promise<void> {
    if (context === undefined) {
      await this.options.clock.sleep(seconds * 1000);
      return;
    }
    const { now, at } = this.options.clock;
    if (now === undefined || at === undefined) throw new AutomationRunClockError(context.runId);
    await runDelay({ now, at }, seconds * 1000, context);
  }
  private structured(context: ActionExecutionContext | undefined): StructuredActionServices {
    if (context === undefined || this.options.structured === undefined)
      throw new AutomationRunClockError('structured action');
    return this.options.structured;
  }
  private async structuredStep(
    action: Exclude<
      Action,
      {
        type:
          | 'temporary_effect'
          | 'target_command'
          | 'command'
          | 'scene'
          | 'delay'
          | 'notify'
          | 'wake_ai'
          | 'tool';
      }
    >,
    execution: Execution,
  ): Promise<void> {
    const services = this.structured(execution.context);
    const { now, at } = this.options.clock;
    const { context, origin, path, parameters } = execution;
    if (context === undefined || now === undefined || at === undefined)
      throw new AutomationRunClockError('structured action');
    await runStructuredAction(
      action,
      {
        services,
        clock: { now, at },
        context,
        origin,
        parameters,
        block: (actions, childPath, childContext) =>
          this.runActions(actions, { ...execution, context: childContext, path: childPath }),
      },
      path,
    );
  }
  private async issue(
    commands: readonly CommandInsert[],
    context?: ActionExecutionContext,
    admitted = false,
  ): Promise<readonly CommandRow[]> {
    admitRun(context);
    const rows = await this.options.store.insertCommands(commands, (inserted) =>
      context?.commands(inserted),
    );
    try {
      admitRun(context);
    } catch (cause) {
      const finish = this.options.store.finishCommand;
      if (finish === undefined) throw cause;
      await Promise.all(
        rows.map((row) => finish(row.id, { status: 'failed', error: describeError(cause) })),
      );
      throw cause;
    }
    await this.options.submit(rows, admitted, () => {
      admitRun(context);
    });
    return rows;
  }
}
