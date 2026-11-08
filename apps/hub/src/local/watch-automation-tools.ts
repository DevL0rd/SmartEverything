import {
  ApiError,
  WATCH_CONFIG,
  type DeviceRow,
  type WatchActionRequest,
  type WatchAlarm,
  type WatchFace,
} from '@smarteverything/domain';
import type { ToolCaller } from '../ai-tools/hub-tool';
import type {
  DriverRuntime,
  DriverTool,
  DriverToolReply,
} from '../automations/plugin-kinds/driver-nodes';
import { optionPage } from '../plugins/builtin/automation-kit-pages';
import type { Store } from '../store/store';
import type { WatchActionBroker, WatchOutcome } from './watch-actions';
import {
  WATCH_ACTION_TOOL,
  WATCH_ALARM_TOOL,
  WATCH_ERROR_CODES,
  WATCH_FACE_PICKER,
  WATCH_FACE_TOOL,
  watchFaceOptions,
  type WatchNodeAction,
} from './watch-automation';
import type { LocalWatches } from './watches';
import { WATCH_DRIVER } from './watch-driver';

export interface WatchToolPorts {
  readonly store: { readonly devices: Pick<Store['devices'], 'find' | 'list'> };
  readonly watches: Pick<LocalWatches, 'target'>;
  readonly actions: Pick<WatchActionBroker, 'attempt'>;
}

const OUTCOME_CODES: Readonly<Record<Extract<WatchOutcome, { ok: false }>['reason'], string>> = {
  unreachable: WATCH_ERROR_CODES.unreachable,
  unanswered: WATCH_ERROR_CODES.unanswered,
  refused: WATCH_ERROR_CODES.refused,
};

const NO_SPORT = 'Choose a sport to start a workout.';

function refusal(message: string, code: string): DriverToolReply {
  return { error: message, code };
}

function actionRequest(
  action: WatchNodeAction,
  sport: Extract<WatchActionRequest, { type: 'start_workout' }>['sport'] | undefined,
): WatchActionRequest | null {
  switch (action) {
    case 'find_watch':
      return { type: 'find_watch', on: true };
    case 'stop_finding':
      return { type: 'find_watch', on: false };
    case 'sync':
      return { type: 'sync' };
    case 'start_workout':
      return sport === undefined ? null : { type: 'start_workout', sport };
    case 'pause_workout':
      return { type: 'pause_workout' };
    case 'resume_workout':
      return { type: 'resume_workout' };
    case 'stop_workout':
      return { type: 'stop_workout' };
  }
}

function configOf(device: DeviceRow): ReturnType<typeof WATCH_CONFIG.safeParse> {
  return WATCH_CONFIG.safeParse(device.details['config']);
}

async function perform(
  ports: WatchToolPorts,
  deviceId: string,
  make: (device: DeviceRow) => WatchActionRequest,
  caller: ToolCaller,
): Promise<DriverToolReply> {
  const device = ports.store.devices.find(deviceId);
  if (device === undefined) {
    return refusal('This watch is no longer added.', WATCH_ERROR_CODES.notFound);
  }
  try {
    const outcome = await ports.actions.attempt(
      ports.watches.target(device),
      make(device),
      `automation:${caller.automationId ?? caller.via}`,
    );
    return outcome.ok
      ? { detail: outcome.detail }
      : refusal(outcome.detail, OUTCOME_CODES[outcome.reason]);
  } catch (cause) {
    if (cause instanceof ApiError) return refusal(cause.message, cause.code);
    throw cause;
  }
}

function alarmOf(
  device: DeviceRow,
  wanted: Pick<WatchAlarm, 'time' | 'days' | 'enabled'>,
): WatchAlarm {
  const config = configOf(device);
  const existing = config.success
    ? config.data.alarms.find((alarm) => alarm.time === wanted.time)
    : undefined;
  return { id: existing?.id ?? null, smart: existing?.smart ?? false, ...wanted };
}

export function watchFacesOf(devices: readonly DeviceRow[]): readonly WatchFace[] {
  return devices
    .filter((device) => device.provider === 'local' && device.details['driver'] === WATCH_DRIVER)
    .flatMap((device) => {
      const config = configOf(device);
      return config.success ? config.data.faces : [];
    });
}

function actionTool(ports: WatchToolPorts): DriverTool {
  return {
    name: WATCH_ACTION_TOOL.name,
    description: 'Runs a watch action: find, sync, or control a workout.',
    input: WATCH_ACTION_TOOL.input,
    run: (args, caller): Promise<DriverToolReply> => {
      const input = WATCH_ACTION_TOOL.input.parse(args);
      const request = actionRequest(input.action, input.sport);
      return request === null
        ? Promise.resolve(refusal(NO_SPORT, 'invalid_request'))
        : perform(ports, input.device, () => request, caller);
    },
  };
}

function alarmTool(ports: WatchToolPorts): DriverTool {
  return {
    name: WATCH_ALARM_TOOL.name,
    description: 'Adds a watch alarm at a time of day, or changes the one at that time.',
    input: WATCH_ALARM_TOOL.input,
    run: (args, caller): Promise<DriverToolReply> => {
      const input = WATCH_ALARM_TOOL.input.parse(args);
      return perform(
        ports,
        input.device,
        (device) => ({
          type: 'save_alarm',
          alarm: alarmOf(device, {
            time: input.time,
            days: input.days ?? [],
            enabled: input.enabled ?? true,
          }),
        }),
        caller,
      );
    },
  };
}

function faceTool(ports: WatchToolPorts): DriverTool {
  return {
    name: WATCH_FACE_TOOL.name,
    description: 'Puts a watch face on the screen of the watch.',
    input: WATCH_FACE_TOOL.input,
    run: (args, caller): Promise<DriverToolReply> => {
      const input = WATCH_FACE_TOOL.input.parse(args);
      return perform(
        ports,
        input.device,
        () => ({ type: 'set_watch_face', id: input.face }),
        caller,
      );
    },
  };
}

export function watchAutomationRuntime(ports: WatchToolPorts): DriverRuntime {
  return {
    tools: [actionTool(ports), alarmTool(ports), faceTool(ports)],
    options: {
      [WATCH_FACE_PICKER]: (query) =>
        Promise.resolve(
          optionPage(watchFaceOptions(watchFacesOf(ports.store.devices.list())), query),
        ),
    },
  };
}
