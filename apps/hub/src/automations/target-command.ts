import {
  ApiError,
  resolveCommandInput,
  targetCapability,
  type GroupCommandPlan,
  type TargetCommandAction,
} from '@smarteverything/domain';
import type { CommandExecutor } from '../commands/executor';
import { describeError } from '../commands/executor';
import {
  prepareTargetCommands,
  resolveTarget,
  submitPreparedTarget,
} from '../device-groups/commands';
import type { Store } from '../store/store';
import { automationBindings } from './bindings';
import { admitRun, awaitRun, type ActionExecutionContext } from './run-context';
import type { StructuredActionServices } from './structured-actions';

type TargetCommand = NonNullable<StructuredActionServices['targetCommand']>;
interface Admission {
  readonly deviceId: string;
  readonly capability: string;
}
function targetAdmissions(store: Store, action: TargetCommandAction): readonly Admission[] {
  const entries = resolveTarget(store, action.target).flatMap((device) => {
    const capability = targetCapability(device, action.capability);
    if (capability?.writable !== true) return [];
    return [{ deviceId: device.id, capability: capability.key }];
  });
  return [...new Map(entries.map((entry) => [JSON.stringify(entry), entry])).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entry]) => entry);
}
function admitMembers<T>(
  executor: CommandExecutor,
  members: readonly Admission[],
  context: ActionExecutionContext,
  work: () => Promise<T>,
): Promise<T> {
  admitRun(context);
  const [member, ...remaining] = members;
  if (member === undefined) return work();
  return awaitRun(
    executor.admit(member.deviceId, member.capability, () =>
      admitMembers(executor, remaining, context, work),
    ),
    context,
  );
}
function skippedNote(skipped: GroupCommandPlan['skipped']): string | null {
  return skipped.length === 0
    ? null
    : `Skipped members: ${skipped.map((entry) => `${entry.deviceId}: ${entry.reason}`).join('; ')}`;
}
async function submitPlan(
  plan: GroupCommandPlan,
  context: ActionExecutionContext,
  issue: Parameters<TargetCommand>[3],
  admitted: boolean,
): Promise<string | null> {
  const note = skippedNote(plan.skipped);
  if (plan.commands.length === 0)
    throw new ApiError('command_refused', note ?? 'No supported target commands.');
  try {
    await submitPreparedTarget(plan, (commands) => {
      admitRun(context);
      return issue(commands, admitted);
    });
  } catch (cause) {
    if (note === null) throw cause;
    throw new ApiError('command_refused', `${describeError(cause)}. ${note}`);
  }
  admitRun(context);
  return note;
}
export function automationTargetCommand(store: Store, executor: CommandExecutor): TargetCommand {
  return async (action, context, parameters, issue): Promise<string | null> => {
    const execute = (): Promise<string | null> => {
      admitRun(context);
      const plan = store.write(() =>
        prepareTargetCommands(store, {
          target: action.target,
          capability: action.capability,
          value:
            'binding' in action
              ? resolveCommandInput(action.binding, automationBindings(store, executor, parameters))
              : action.value,
          ...(action.scale === undefined ? {} : { scale: action.scale }),
        }),
      );
      return submitPlan(plan, context, issue, 'binding' in action);
    };
    if (!('binding' in action)) return execute();
    for (;;) {
      admitRun(context);
      const members = targetAdmissions(store, action);
      const result = await admitMembers(executor, members, context, () =>
        JSON.stringify(members) === JSON.stringify(targetAdmissions(store, action))
          ? execute()
          : Promise.resolve(undefined),
      );
      if (result !== undefined) return result;
    }
  };
}
