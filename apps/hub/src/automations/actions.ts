import type { PluginOrigin, SignalInput, StepV2 } from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { AutomationAiSlot } from './automation-ai';
import type { ComputerSteps } from './computer-steps';
import { FlowSteps } from './flow-steps';
import type { AutomationWorld } from './world';
import type { CommandIssuer } from './issue-commands';
import type { ProgramSteps } from './program-steps';
import { admitRun, awaitRun, runDelay, type RunContext } from './run-context';
import { nodeIdOf, type SetSteps } from './set-step';
import { failureLine } from '@smarteverything/logging';

export interface ActionOrigin {
  readonly automationId: string;
  readonly name: string;
  readonly signal: SignalInput | null;
  readonly plugin: PluginOrigin | null;
}

class UnknownSceneError extends Error {
  override readonly name = 'UnknownSceneError';
  constructor(sceneId: string) {
    super(`Scene ${sceneId} does not exist in this home.`);
  }
}

interface ActionRunnerOptions {
  readonly sets: SetSteps;
  readonly program: ProgramSteps;
  readonly computers: ComputerSteps;
  readonly issuer: CommandIssuer;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly ai: AutomationAiSlot;
  readonly notify: (origin: ActionOrigin, message: string) => void;
  readonly world: AutomationWorld;
}

type SimpleStepV2 = Extract<StepV2, { do: 'scene' | 'wait' | 'notify' | 'ai' | 'tool' }>;
const SIMPLE: ReadonlySet<string> = new Set(['scene', 'wait', 'notify', 'ai', 'tool']);

function isSimple(step: StepV2): step is SimpleStepV2 {
  return SIMPLE.has(step.do);
}

function originOf(context: RunContext): ActionOrigin {
  return {
    automationId: context.automationId,
    name: context.name,
    signal: context.trigger,
    plugin: context.origin,
  };
}

export class ActionRunner {
  private readonly flow: FlowSteps;

  constructor(private readonly options: ActionRunnerOptions) {
    this.flow = new FlowSteps(options.world, options.clock, (steps, context) =>
      this.run(steps, context),
    );
  }

  async run(steps: readonly StepV2[], context: RunContext): Promise<void> {
    for (const step of steps) await this.step(step, context);
  }

  private async step(step: StepV2, context: RunContext): Promise<void> {
    admitRun(context);
    const nodeId = nodeIdOf(step);
    context.begin(nodeId);
    try {
      const note = await this.dispatch(step, context);
      admitRun(context);
      context.end({ nodeId, status: 'succeeded', commandIds: [], error: note });
    } catch (cause) {
      const status = context.signal.aborted ? 'cancelled' : 'failed';
      context.end({ nodeId, status, commandIds: [], error: failureLine(cause) });
      throw cause;
    }
  }

  private dispatch(step: StepV2, context: RunContext): Promise<string | null> {
    const { sets, program, computers } = this.options;
    if (isSimple(step)) return this.simple(step, context);
    switch (step.do) {
      case 'set':
        return sets.run(step, context);
      case 'if':
        return this.flow.branch(step, context);
      case 'repeat':
        return this.flow.repeat(step, context);
      case 'run':
        return program.run(step, context);
      case 'value':
        return Promise.resolve(program.value(step, context));
      case 'stop':
        return Promise.resolve(program.stop(step, context));
      case 'audio':
        return computers.audio(step, context);
      case 'display':
        return computers.display(step, context);
    }
  }

  private async simple(step: SimpleStepV2, context: RunContext): Promise<null> {
    const origin = originOf(context);
    const { ai, clock, notify } = this.options;
    switch (step.do) {
      case 'scene':
        await this.scene(step.scene, context);
        return null;
      case 'wait':
        await runDelay(clock, step.ms, context);
        return null;
      case 'notify':
        notify(origin, step.message);
        return null;
      case 'ai':
        await awaitRun(
          ai.current().wake(
            {
              type: 'wake_ai',
              profileId: step.person,
              chatId: step.chat ?? null,
              instruction: step.instruction,
            },
            origin,
          ),
          context,
        );
        return null;
      case 'tool':
        await awaitRun(
          ai
            .current()
            .tool(
              { type: 'tool', profileId: step.person, tool: step.tool, args: step.args ?? {} },
              origin,
            ),
          context,
        );
        return null;
    }
  }

  private async scene(sceneId: string, context: RunContext): Promise<void> {
    const actions = context.scenes[sceneId];
    if (actions === undefined) throw new UnknownSceneError(sceneId);
    await awaitRun(
      this.options.issuer.issue(
        actions.map((action) => ({
          deviceId: action.deviceId,
          capability: action.capability,
          value: action.value,
        })),
        'scene',
        context,
      ),
      context,
    );
  }
}
