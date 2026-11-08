import {
  ApiError,
  LAUNDRY_DELAY_MODES,
  LAUNDRY_DRAFT,
  LaundryRoleMissingError,
  laundryCommands,
  laundryProgramByRaw,
  laundryProgramOptions,
  laundryReadiness,
  laundryStartPlan,
  laundryValuesOf,
  presentDevice,
  type ActionMode,
  type CapabilityKey,
  type DeviceRow,
  type LaundryCommand,
  type LaundryDraft,
  type LaundryProgram,
  type LaundryRole,
} from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { outputs, parsed } from '../engine-v3-effects';
import { DEVICE_REF } from '../world-v3/refs';
import { modeOf } from './action-mode';
import { stampOf } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectHandlers, EffectRun } from './effect-run';

export interface LaundryEffectPorts {
  readonly store: Store;
  readonly setter: Pick<DeviceSetter, 'set'>;
}

const MILLISECONDS_PER_MINUTE = 60_000;

const WHOLE_NUMBER_TEXT = z
  .string()
  .regex(/^\d+$/)
  .transform((text) => Number(text));

const WHOLE_MINUTES = z
  .number()
  .positive()
  .refine((milliseconds) => milliseconds % MILLISECONDS_PER_MINUTE === 0, {
    message: 'The delay must be a whole number of minutes.',
  })
  .transform((milliseconds) => milliseconds / MILLISECONDS_PER_MINUTE);

const START_PARAMS = z.object({
  machine: DEVICE_REF,
  program: z.string().min(1),
  temperature: WHOLE_NUMBER_TEXT.optional(),
  spin: WHOLE_NUMBER_TEXT.optional(),
  delay: WHOLE_MINUTES.optional(),
  delayMode: z.enum(LAUNDRY_DELAY_MODES).default('Start Wash'),
});

const CONTROL_ROLES = { pause: 'cycle_pause', stop: 'cycle_stop' } as const;

const CONTROL_PARAMS = z.object({
  machine: DEVICE_REF,
  action: z.enum(['pause', 'stop']),
});

type StartAsk = z.infer<typeof START_PARAMS>;

interface Call {
  readonly request: EffectRequest;
  readonly run: EffectRun;
}

interface Machine {
  readonly device: DeviceRow;
  readonly keyOf: (role: LaundryRole | 'power') => CapabilityKey | undefined;
  readonly values: ReturnType<typeof laundryValuesOf>;
}

function machineOf(store: Store, deviceId: string): Machine {
  const device = store.devices.byId(deviceId);
  const presentation = presentDevice(device);
  if (presentation.family !== 'laundry')
    throw new ApiError('invalid_request', `${device.name} is not a washing machine or dryer.`);
  const sources = presentation.capabilities.map(({ key, role }) => ({ key, role }));
  return {
    device,
    keyOf: (role) => presentation.capabilities.find((presented) => presented.role === role)?.key,
    values: laundryValuesOf(sources, (key) => store.state.value(device.id, key)),
  };
}

function programOf(raw: string): LaundryProgram {
  const program = laundryProgramByRaw(raw);
  if (program === undefined)
    throw new ApiError('invalid_request', `"${raw}" is not a program a washing machine offers.`);
  return program;
}

function draftOf(ask: StartAsk): LaundryDraft {
  const checked = LAUNDRY_DRAFT.safeParse({
    program: ask.program,
    ...(ask.temperature === undefined ? {} : { temperature: ask.temperature }),
    ...(ask.spin === undefined ? {} : { spin: ask.spin }),
    ...(ask.delay === undefined ? {} : { delay: { mode: ask.delayMode, minutes: ask.delay } }),
  });
  if (!checked.success) throw new ApiError('invalid_request', z.prettifyError(checked.error));
  return checked.data;
}

function ignoredOptions(ask: StartAsk, program: LaundryProgram): readonly string[] {
  const used = new Set(laundryProgramOptions(program));
  return [
    ...(ask.temperature !== undefined && !used.has('temperature') ? ['Temperature'] : []),
    ...(ask.spin !== undefined && !used.has('spin') ? ['Spin speed'] : []),
  ];
}

function commandsOf(machine: Machine, draft: LaundryDraft): readonly LaundryCommand[] {
  try {
    return laundryCommands(laundryStartPlan(draft, machine.values), machine.keyOf);
  } catch (cause) {
    if (cause instanceof LaundryRoleMissingError)
      throw new ApiError(
        'command_refused',
        `${machine.device.name} cannot do this: ${cause.message}`,
      );
    throw cause;
  }
}

async function send(
  ports: LaundryEffectPorts,
  deviceId: string,
  command: LaundryCommand,
  { mode, call }: { readonly mode: ActionMode; readonly call: Call },
): Promise<void> {
  await ports.setter.set(
    {
      target: { kind: 'devices', deviceIds: [deviceId] },
      control: command.capability,
      value: () => command.value,
      percent: false,
      serialised: false,
      requireAll: true,
      mode,
      at: stampOf(call.request.path),
    },
    call.run,
  );
}

function laundryStart(ports: LaundryEffectPorts): EffectHandlers[string] {
  return async (params, request, run) => {
    const checked = parsed(START_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      const program = programOf(ask.program);
      const draft = draftOf(ask);
      const machine = machineOf(ports.store, ask.machine);
      const blocked = laundryReadiness(machine.values, machine.device.online);
      if (blocked !== null) throw new ApiError('command_refused', blocked);
      const commands = commandsOf(machine, draft);
      const last = commands.length - 1;
      for (const [index, command] of commands.entries())
        await send(ports, machine.device.id, command, {
          mode: index === last ? modeOf(request) : 'wait_for_result',
          call: { request, run },
        });
      return { ok: true, value: outputs({ ok: true, ignored: ignoredOptions(ask, program) }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function laundryControl(ports: LaundryEffectPorts): EffectHandlers[string] {
  return async (params, request, run) => {
    const checked = parsed(CONTROL_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      const machine = machineOf(ports.store, ask.machine);
      const capability = machine.keyOf(CONTROL_ROLES[ask.action]);
      if (capability === undefined)
        throw new ApiError('command_refused', `${machine.device.name} cannot ${ask.action}.`);
      await send(
        ports,
        machine.device.id,
        { capability, value: null },
        { mode: modeOf(request), call: { request, run } },
      );
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function laundryEffects(ports: LaundryEffectPorts): EffectHandlers {
  return { 'laundry.start': laundryStart(ports), 'laundry.control': laundryControl(ports) };
}
