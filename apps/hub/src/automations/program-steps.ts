import {
  ApiError,
  AUTOMATION_VALUE_OPERATION,
  runInputError,
  type AutomationValueContent,
  type AutomationValueOperation,
  type JsonValue,
  type StepV2,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { definitionOf } from './definition';
import type { OwnedAutomationRuns, OwnedRunAdmission } from './owned-runs';
import { admitRun, type RunContext } from './run-context';
import type { AutomationWorld } from './world';

type ValueStepV2 = Extract<StepV2, { do: 'value' }>;
type RunStepV2 = Extract<StepV2, { do: 'run' }>;
type StopStepV2 = Extract<StepV2, { do: 'stop' }>;

export interface CallRequest {
  readonly automationId: string;
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly parent: RunContext;
  readonly waits: boolean;
}

function valueOperation(
  content: AutomationValueContent,
  step: Pick<ValueStepV2, 'op'>,
  amount: JsonValue | undefined,
): AutomationValueOperation {
  const parsed = AUTOMATION_VALUE_OPERATION.safeParse({
    kind: content.kind,
    operation: { type: step.op, ...(amount === undefined ? {} : { value: amount }) },
  });
  if (!parsed.success)
    throw new ApiError('invalid_request', `The Value ${content.name} does not accept ${step.op}.`);
  return parsed.data;
}

export class ProgramSteps {
  constructor(
    private readonly store: Store,
    private readonly world: AutomationWorld,
    private readonly runs: Pick<OwnedAutomationRuns, 'stop' | 'cancelAutomation'>,
    readonly call: (request: CallRequest) => OwnedRunAdmission,
  ) {}

  value(step: ValueStepV2, context: RunContext): null {
    const content = this.store.automationValues.byId(step.value).content;
    const amount =
      step.amount === undefined ? undefined : this.world.input(step.amount, context.inputs);
    this.store.automationValues.apply(step.value, valueOperation(content, step, amount));
    return null;
  }

  async run(step: RunStepV2, context: RunContext): Promise<null> {
    const callee = definitionOf(this.store.automations.byId(step.automation));
    const inputs = Object.fromEntries(
      Object.entries(step.inputs ?? {}).map(([name, input]) => [
        name,
        this.world.input(input, context.inputs),
      ]),
    );
    const problem = runInputError(callee.inputs, inputs);
    if (problem !== null) throw new ApiError('invalid_request', problem);
    const waits = step.wait === true;
    const admission = this.call({ automationId: step.automation, inputs, parent: context, waits });
    if (!waits) return null;
    const error = await admission.finished;
    admitRun(context);
    if (error !== null) throw new ApiError('command_refused', error);
    return null;
  }

  stop(step: StopStepV2, context: RunContext): null {
    if (step.automation === undefined) this.runs.stop(context.runId);
    else this.runs.cancelAutomation(step.automation, step.key);
    admitRun(context);
    return null;
  }
}
