import {
  ApiError,
  APP_CLOSED,
  COMPUTER_ACTIONS,
  MACHINE_OPEN_TARGET,
  SERVICES_STATE,
  SERVICE_OPERATIONS,
  STARTUP_STATE,
  SYSTEM_STATE,
  SYSTEM_TOOL_CHANGE,
  POWER_MODES,
  WINDOWS_STATE,
  type NodeRequest,
  type SystemToolChange,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { AutomationComputers, AutomationComputersSlot } from '../automation-computers';
import { effectFailure } from '../effect-failure';
import { outputs, parsed } from '../engine-v3-effects';
import { modeOf } from './action-mode';
import { stampOf } from './command-metadata';
import { runViewer } from './computer';
import { mergedChange, same, type Fields } from './computer-change';
import { deliver } from './deliver';
import type { DeviceSetter } from './device-set';
import type { EffectHandler, EffectHandlers, EffectRun } from './effect-run';

export interface ComputerSystemPorts {
  readonly computers: AutomationComputersSlot;
  readonly setter: Pick<DeviceSetter, 'set'>;
}

interface Plan {
  readonly work: (computers: AutomationComputers) => Promise<unknown>;
}

const ID = z.string().min(1);

const COMPUTER = z.union([ID, z.strictObject({ computer: ID }).transform((ref) => ref.computer)]);

const POWER_PARAMS = z.object({ computer: COMPUTER, action: z.enum(COMPUTER_ACTIONS) });

const SYSTEM_PARAMS = z.object({
  computer: COMPUTER,
  setting: ID,
  mode: z.enum(POWER_MODES).optional(),
  enabled: z.boolean().optional(),
  layout: ID.optional(),
  network: ID.optional(),
  device: ID.optional(),
  connected: z.boolean().optional(),
  startupApp: ID.optional(),
  unit: ID.optional(),
  operation: z.enum(SERVICE_OPERATIONS).optional(),
});

const APP_PARAMS = z.object({
  computer: COMPUTER,
  action: z.enum(['open', 'close', 'focus', 'minimise']),
  app: ID,
  force: z.boolean().default(false),
});

const OPEN_PARAMS = z.object({ computer: COMPUTER, url: ID.optional(), path: ID.optional() });

export const SYSTEM_FIELDS: Fields = {
  power_mode: same('mode'),
  dnd: same('enabled'),
  keyboard_layout: same('layout'),
  wifi: same('enabled'),
  wifi_connect: same('network'),
  bluetooth: same('enabled'),
  bluetooth_device: same('device', 'connected'),
  startup_app: [
    ['id', 'startupApp'],
    ['enabled', 'enabled'],
  ],
  service: same('unit', 'operation'),
};

const PORT_WORDS: Readonly<Record<string, string>> = {
  mode: 'power mode',
  enabled: 'on or off',
  layout: 'keyboard layout',
  network: 'network',
  device: 'Bluetooth device',
  connected: 'connected or not',
  startupApp: 'startup app',
  unit: 'service',
  operation: 'operation',
};

function missingPorts(setting: string, params: z.infer<typeof SYSTEM_PARAMS>): readonly string[] {
  const values: Readonly<Record<string, unknown>> = params;
  return (SYSTEM_FIELDS[setting] ?? [])
    .filter(([, port]) => values[port] === undefined)
    .map(([, port]) => PORT_WORDS[port] ?? port);
}

function systemChange(params: z.infer<typeof SYSTEM_PARAMS>): SystemToolChange {
  const missing = missingPorts(params.setting, params);
  if (missing.length > 0) {
    throw new ApiError(
      'invalid_request',
      `Choose the ${missing.join(' and the ')} for this setting.`,
    );
  }
  const raw = mergedChange(SYSTEM_FIELDS, { ...params, action: params.setting });
  const checked = SYSTEM_TOOL_CHANGE.safeParse(raw);
  if (!checked.success) throw new ApiError('invalid_request', z.prettifyError(checked.error));
  return checked.data;
}

interface Call {
  readonly request: NodeRequest;
  readonly schema: z.ZodType;
}

function systemCall(change: SystemToolChange): Call {
  if (change.action === 'startup_app') {
    return { request: { verb: 'startup_set', change }, schema: STARTUP_STATE };
  }
  if (change.action === 'service') {
    return { request: { verb: 'service_set', change }, schema: SERVICES_STATE };
  }
  return { request: { verb: 'system_set', change }, schema: SYSTEM_STATE };
}

function systemWork(computer: string, change: SystemToolChange): Plan['work'] {
  const { request, schema } = systemCall(change);
  return (computers) => computers.ask(runViewer(), computer, request, schema);
}

async function windowsWork(
  computers: AutomationComputers,
  ask: z.infer<typeof APP_PARAMS>,
): Promise<void> {
  const { computer, app } = ask;
  const state = await computers.ask(runViewer(), computer, { verb: 'windows' }, WINDOWS_STATE);
  const own = state.windows.filter((window) => window.app?.id === app);
  if (own.length === 0) {
    throw new ApiError('not_found', `${app} has no open window on this computer.`);
  }
  const action = ask.action === 'focus' ? 'focus' : 'minimise';
  const chosen = action === 'focus' ? own.slice(0, 1) : own;
  await Promise.all(
    chosen.map((window) =>
      computers.ask(
        runViewer(),
        computer,
        { verb: 'window_set', change: { windowId: window.id, action } },
        WINDOWS_STATE,
      ),
    ),
  );
}

function appWork(ask: z.infer<typeof APP_PARAMS>): Plan['work'] {
  const { computer, app } = ask;
  return (computers) => {
    if (ask.action === 'open') {
      return computers.ask(runViewer(), computer, { verb: 'open_app', appId: app }, z.null());
    }
    if (ask.action === 'close') {
      const request = { verb: 'close_app', appId: app, force: ask.force } as const;
      return computers.ask(runViewer(), computer, request, APP_CLOSED);
    }
    return windowsWork(computers, ask);
  };
}

function openWork(ask: z.infer<typeof OPEN_PARAMS>): Plan['work'] {
  if ((ask.url === undefined) === (ask.path === undefined)) {
    throw new ApiError(
      'invalid_request',
      'Give a link or a path to open, not both and not neither.',
    );
  }
  const wanted =
    ask.url === undefined ? { kind: 'path', path: ask.path } : { kind: 'url', url: ask.url };
  const target = MACHINE_OPEN_TARGET.safeParse(wanted);
  if (!target.success) throw new ApiError('invalid_request', z.prettifyError(target.error));
  return (computers) =>
    computers.ask(runViewer(), ask.computer, { verb: 'open', target: target.data }, z.null());
}

async function sent(
  ports: ComputerSystemPorts,
  request: EffectRequest,
  run: EffectRun,
  work: Plan['work'],
): Promise<NodeResult> {
  const computers = ports.computers.current();
  await deliver({ kind: request.kind, mode: modeOf(request), run, work: () => work(computers) });
  return { ok: true, value: outputs({ ok: true }) };
}

function handlerOf<T>(
  schema: z.ZodType<T>,
  plan: (
    ask: T,
    ports: ComputerSystemPorts,
    request: EffectRequest,
    run: EffectRun,
  ) => Promise<NodeResult>,
  ports: ComputerSystemPorts,
): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(schema, params);
    if (!checked.ok) return checked;
    try {
      return await plan(checked.value, ports, request, run);
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

async function power(
  ask: z.infer<typeof POWER_PARAMS>,
  ports: ComputerSystemPorts,
  request: EffectRequest,
  run: EffectRun,
): Promise<NodeResult> {
  const { computer, action } = ask;
  if (action !== 'wake') {
    return sent(ports, request, run, (computers) =>
      computers.ask(runViewer(), computer, { verb: 'power', action }, z.null()),
    );
  }
  await ports.setter.set(
    {
      target: { kind: 'devices', deviceIds: [computer] },
      control: 'wake',
      value: () => null,
      percent: false,
      serialised: false,
      mode: modeOf(request),
      at: stampOf(request.path),
    },
    run,
  );
  return { ok: true, value: outputs({ ok: true }) };
}

export function computerSystemEffects(ports: ComputerSystemPorts): EffectHandlers {
  return {
    'computer.power': handlerOf(POWER_PARAMS, power, ports),
    'computer.system': handlerOf(
      SYSTEM_PARAMS,
      (ask, own, request, run) =>
        sent(own, request, run, systemWork(ask.computer, systemChange(ask))),
      ports,
    ),
    'computer.app': handlerOf(
      APP_PARAMS,
      (ask, own, request, run) => sent(own, request, run, appWork(ask)),
      ports,
    ),
    'computer.open': handlerOf(
      OPEN_PARAMS,
      (ask, own, request, run) => sent(own, request, run, openWork(ask)),
      ports,
    ),
  };
}
