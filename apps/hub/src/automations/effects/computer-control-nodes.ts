import {
  ApiError,
  COMPUTER_INPUT,
  PROCESS_NICE,
  PROCESS_PRIORITIES,
  PROCESS_SIGNALS,
  WINDOWS_STATE,
  type ComputerInput,
  type NodeRequest,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { Logger, failureLine } from '@smarteverything/logging';
import { z } from 'zod';
import type { AutomationComputersSlot } from '../automation-computers';
import { effectFailure } from '../effect-failure';
import { outputs, parsed } from '../engine-v3-effects';
import { modeOf } from './action-mode';
import { runViewer } from './computer';
import { deliver } from './deliver';
import type { EffectHandler, EffectHandlers, EffectRun } from './effect-run';
import { awaitRun } from './run-abort';

export interface ComputerControlPorts {
  readonly computers: AutomationComputersSlot;
}

const log = new Logger('hub.automations');

const ID = z.string().min(1);

const COMPUTER = z.union([ID, z.strictObject({ computer: ID }).transform((ref) => ref.computer)]);

const PROGRAM = z.union([
  z.int().positive(),
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number),
]);

const KEYS_PARAMS = z.object({
  computer: COMPUTER,
  keys: ID.optional(),
  text: ID.optional(),
});

const PROCESS_PARAMS = z.object({
  computer: COMPUTER,
  action: z.enum([...PROCESS_SIGNALS, 'priority']),
  process: z.array(PROGRAM).min(1),
  priority: z.enum(PROCESS_PRIORITIES).optional(),
});

const WINDOWS_PARAMS = z.object({ computer: COMPUTER });

function inputOf(ask: z.infer<typeof KEYS_PARAMS>): ComputerInput {
  if ((ask.keys === undefined) === (ask.text === undefined)) {
    throw new ApiError('invalid_request', 'Give keys or a text to type, not both and not neither.');
  }
  const wanted =
    ask.keys === undefined
      ? { action: 'type', text: ask.text }
      : { action: 'keys', keys: ask.keys };
  const checked = COMPUTER_INPUT.safeParse(wanted);
  if (!checked.success) throw new ApiError('invalid_request', z.prettifyError(checked.error));
  return checked.data;
}

function programRequest(
  ask: z.infer<typeof PROCESS_PARAMS>,
  pid: number,
): { readonly request: NodeRequest; readonly schema: z.ZodType } {
  if (ask.action !== 'priority') {
    return { request: { verb: 'signal', pid, signal: ask.action }, schema: z.null() };
  }
  if (ask.priority === undefined) {
    throw new ApiError('invalid_request', 'Choose the priority for this action.');
  }
  return {
    request: { verb: 'priority', pid, nice: PROCESS_NICE[ask.priority] },
    schema: z.unknown(),
  };
}

async function reachPrograms(
  slot: AutomationComputersSlot,
  ask: z.infer<typeof PROCESS_PARAMS>,
  run: EffectRun,
): Promise<number> {
  const computers = slot.current();
  const pids = [...new Set(ask.process)];
  const settled = await Promise.allSettled(
    pids.map((pid) => {
      const { request, schema } = programRequest(ask, pid);
      return awaitRun(computers.ask(runViewer(), ask.computer, request, schema), run);
    }),
  );
  const reached = settled.filter((each) => each.status === 'fulfilled').length;
  const failures = settled.filter((each) => each.status === 'rejected');
  const [first] = failures;
  if (reached === 0 && first !== undefined) throw first.reason;
  for (const failure of failures) {
    log.warn('automation.process_unreached', {
      automationId: run.automationId,
      runId: run.runId,
      action: ask.action,
      reason: failureLine(failure.reason),
    });
  }
  return reached;
}

function handlerOf<T>(
  schema: z.ZodType<T>,
  plan: (ask: T, request: EffectRequest, run: EffectRun) => Promise<NodeResult>,
): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(schema, params);
    if (!checked.ok) return checked;
    try {
      return await plan(checked.value, request, run);
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

async function keys(
  ports: ComputerControlPorts,
  ask: z.infer<typeof KEYS_PARAMS>,
  request: EffectRequest,
  run: EffectRun,
): Promise<NodeResult> {
  const input = inputOf(ask);
  const computers = ports.computers.current();
  await deliver({
    kind: request.kind,
    mode: modeOf(request),
    run,
    work: () => computers.ask(runViewer(), ask.computer, { verb: 'input', input }, z.unknown()),
  });
  return { ok: true, value: outputs({ ok: true }) };
}

async function programs(
  ports: ComputerControlPorts,
  ask: z.infer<typeof PROCESS_PARAMS>,
  run: EffectRun,
): Promise<NodeResult> {
  const ended = await reachPrograms(ports.computers, ask, run);
  return { ok: true, value: outputs({ ended }) };
}

async function windows(
  ports: ComputerControlPorts,
  ask: z.infer<typeof WINDOWS_PARAMS>,
  run: EffectRun,
): Promise<NodeResult> {
  const state = await awaitRun(
    ports.computers.current().ask(runViewer(), ask.computer, { verb: 'windows' }, WINDOWS_STATE),
    run,
  );
  const named = state.windows.flatMap((window) =>
    window.app === null ? [] : [{ name: window.app.name, focused: window.focused }],
  );
  const apps = [...new Set(named.map((window) => window.name))];
  const focused = named.find((window) => window.focused)?.name;
  return {
    ok: true,
    value: outputs({ apps, ...(focused === undefined ? {} : { focused }) }),
  };
}

export function computerControlEffects(ports: ComputerControlPorts): EffectHandlers {
  return {
    'computer.keys': handlerOf(KEYS_PARAMS, (ask, request, run) => keys(ports, ask, request, run)),
    'computer.process': handlerOf(PROCESS_PARAMS, (ask, _request, run) =>
      programs(ports, ask, run),
    ),
    'computer.windows': handlerOf(WINDOWS_PARAMS, (ask, _request, run) => windows(ports, ask, run)),
  };
}
