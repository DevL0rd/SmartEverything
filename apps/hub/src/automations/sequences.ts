import {
  ApiError,
  PLUGIN_ORIGIN,
  checkedBindingValue,
  resolveAutomationInput,
  type AutomationInput,
  type AutomationRunRow,
  type AutomationSequenceRow,
  type JsonValue,
  type PluginOrigin,
} from '@smarteverything/domain';
import { inheritedOrigin } from '../assistant/authority-inheritance';
import { withEffectAuthority } from '../harness/effect-authority';
import type { Store } from '../store/store';
import type { ActionOrigin, ActionRunner } from './actions';
import type { OwnedAutomationRuns, OwnedRunAdmission, OwnedRunTask } from './owned-runs';
import { admitManualAutomation } from './manual-run';
import { ownedSequenceTask } from './sequence-task';
import type { StructuredActionServices } from './structured-actions';
import { admitRun, type ActionExecutionContext } from './run-context';

interface SequenceCaller {
  readonly parent: ActionExecutionContext;
  readonly origin: ActionOrigin;
}
interface SequenceCall {
  readonly id: string;
  readonly parameters: Readonly<Record<string, AutomationInput>>;
  readonly origin: ActionOrigin;
}
export class AutomationSequences {
  constructor(
    private readonly store: Store,
    private readonly runs: OwnedAutomationRuns,
    private readonly runner: () => ActionRunner,
    private readonly bindings: StructuredActionServices['bindingContext'],
  ) {}
  start(id: string, parameters: Readonly<Record<string, JsonValue>>): AutomationRunRow {
    return this.admit(id, parameters).row;
  }
  async call(
    request: SequenceCall,
    parent: ActionExecutionContext,
    outerParameters: Readonly<Record<string, JsonValue>>,
  ): Promise<void> {
    admitRun(parent);
    const values = this.store.write(() =>
      Object.fromEntries(
        Object.entries(request.parameters).map(([name, input]) => [
          name,
          resolveAutomationInput(input, this.bindings(outerParameters)),
        ]),
      ),
    );
    const admission = this.admit(request.id, values, { parent, origin: request.origin });
    const error = await admission.finished;
    admitRun(parent);
    if (error !== null) throw new ApiError('command_refused', error);
  }
  private admit(
    id: string,
    parameters: Readonly<Record<string, JsonValue>>,
    caller?: SequenceCaller,
  ): OwnedRunAdmission {
    const parent = caller?.parent;
    const sequence =
      parent?.sequence === undefined
        ? this.store.automationSequences.byId(id)
        : parent.sequence(id);
    validateSequenceArguments(sequence, parameters);
    const admit =
      parent === undefined
        ? admitManualAutomation(this.store, sequence.definition)
        : parent.authorize;
    const task = ownedSequenceTask(
      this.store,
      sequence,
      this.execution(sequence, parameters, caller?.origin),
      admit,
    );
    return this.runs.start({
      ...task,
      parameters,
      ...(parent === undefined ? {} : { parentSignal: parent.signal, parentRunId: parent.runId }),
      ...(parent?.ownerProfileId === undefined ? {} : { ownerProfileId: parent.ownerProfileId }),
    });
  }
  private execution(
    sequence: AutomationSequenceRow,
    parameters: Readonly<Record<string, JsonValue>>,
    parent?: ActionOrigin,
  ): OwnedRunTask['execute'] {
    const origin: ActionOrigin = {
      automationId: sequence.id,
      name: sequence.name,
      signal: parent?.signal ?? null,
      plugin: sequencePlugin(sequence.definition.origin, parent?.plugin),
      targetType: 'sequence',
    };
    return async (context): Promise<null> => {
      await withEffectAuthority(this.store, 'sequence', sequence.id, () =>
        this.runner().runWithParameters(sequence.definition.actions, origin, context, parameters),
      );
      return null;
    };
  }
}
function validateSequenceArguments(
  sequence: AutomationSequenceRow,
  parameters: Readonly<Record<string, JsonValue>>,
): void {
  const declared = sequence.definition.parameters;
  if (declared.length !== Object.keys(parameters).length)
    throw new ApiError('invalid_request', 'Sequence parameters do not match its definition.');
  for (const parameter of declared) {
    const value = parameters[parameter.name];
    if (value === undefined)
      throw new ApiError('invalid_request', `Missing sequence parameter ${parameter.name}.`);
    checkedBindingValue(parameter.kind, value);
  }
}
function sequencePlugin(
  saved: PluginOrigin | null,
  parent: PluginOrigin | null | undefined,
): PluginOrigin | null {
  const origins = [saved, parent].filter(
    (origin): origin is PluginOrigin => origin !== null && origin !== undefined,
  );
  const inherited = inheritedOrigin(origins);
  return inherited.plugin_id === null ? null : PLUGIN_ORIGIN.parse(inherited);
}
