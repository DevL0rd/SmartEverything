import {
  CommandRefusedError,
  ROBOT_ACTION_CAPABILITY,
  ROBOT_DRIVER_ID,
  type DeviceCapability,
  type DeviceCommand,
  type DiscoveredDevice,
  type JsonValue,
  type RobotReport,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DeviceMirrorSpec } from '../device-mirror';
import { RobotActionNotEnabledError, RobotActionParamError } from './catalogue';
import type { VoiceDesk } from './desk';
import type { RobotIdentity } from './identity';

export interface RobotSnapshot {
  readonly identity: RobotIdentity | null;
  readonly report: RobotReport | null;
  readonly online: boolean;
  readonly at: string;
}

const ACTION_CAPABILITY: DeviceCapability = {
  key: ROBOT_ACTION_CAPABILITY,
  label: 'Move or act',
  access: 'write',
  value: { kind: 'action', arguments: ['action', 'options'] },
};

const ACTION_VALUE = z.strictObject({
  action: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
});

const NOT_IN_CONVERSATION =
  'AIBI is not in a conversation, and it can only be moved in answer to something it says to the server; ask it to talk, then try again';

export function robotExternalId(identity: RobotIdentity): string {
  return `${ROBOT_DRIVER_ID}:${identity.deviceId}`;
}

function detailsOf(snapshot: RobotSnapshot): Record<string, JsonValue> {
  const { report } = snapshot;
  const candidates: readonly (readonly [string, string | null | undefined])[] = [
    ['firmware', report?.firmware],
    ['version', report?.version],
    ['language', report?.language],
    ['timezone', report?.timezone],
    ['city', report?.city],
    ['country', report?.country],
    ['robotName', report?.name],
    ['age', report?.age],
    ['updateError', report?.updateError],
  ];
  return Object.fromEntries(
    candidates.flatMap(([key, value]) =>
      value === null || value === undefined ? [] : [[key, value]],
    ),
  );
}

function describeRobot(snapshot: RobotSnapshot): DiscoveredDevice | null {
  const { identity } = snapshot;
  if (identity === null) {
    return null;
  }
  return {
    provider: 'local',
    externalId: robotExternalId(identity),
    parentExternalId: null,
    kind: 'robot',
    name: 'AIBI',
    model: 'AIBI robot',
    manufacturer: 'AIBI',
    room: null,
    online: snapshot.online,
    capabilities: [ACTION_CAPABILITY],
    details: detailsOf(snapshot),
  };
}

export const ROBOT_MIRROR: DeviceMirrorSpec<RobotSnapshot> = {
  externalId: ROBOT_DRIVER_ID,
  describe: describeRobot,
  readings: () => null,
  observedAt: (snapshot) => snapshot.at,
  sampled: null,
};

function played(
  capability: string,
  desk: Pick<VoiceDesk, 'playAction'>,
  value: z.output<typeof ACTION_VALUE>,
): boolean {
  try {
    return desk.playAction(value.action, value.options ?? {});
  } catch (cause) {
    if (cause instanceof RobotActionNotEnabledError || cause instanceof RobotActionParamError) {
      throw new CommandRefusedError(capability, cause.message);
    }
    throw cause;
  }
}

export function performAction(
  command: DeviceCommand,
  desk: Pick<VoiceDesk, 'playAction'>,
): JsonValue {
  if (command.capability !== ROBOT_ACTION_CAPABILITY) {
    throw new CommandRefusedError(command.capability, 'AIBI only moves or acts');
  }
  const value = ACTION_VALUE.parse(command.value);
  if (!played(command.capability, desk, value)) {
    throw new CommandRefusedError(command.capability, NOT_IN_CONVERSATION);
  }
  return {
    queued: true,
    delivered: 'with the answer to the next thing AIBI asks the server',
  };
}
