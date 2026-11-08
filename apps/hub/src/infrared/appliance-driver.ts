import {
  CommandRefusedError,
  IR_AC_MODES,
  IR_APPLIANCE_APPLY,
  type DeviceCommand,
  type IrApplianceApply,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DeviceDriver } from '../local/device-driver';
import type { ChangeFeed } from '../store/feed';
import { IR_APPLIANCE_DRIVER, applianceIdOf } from './appliance-devices';
import { IR_FAN_SPEEDS } from './appliance-model';
import type { IrApplianceService } from './appliance-service';

const GOAL_OF: Readonly<Record<string, (value: JsonValue) => IrApplianceApply>> = {
  power: (value) => ({ on: z.boolean().parse(value) }),
  hvac_mode: (value) => ({ mode: z.enum(IR_AC_MODES).parse(value) }),
  target_temperature: (value) => IR_APPLIANCE_APPLY.parse({ temp: value }),
  fan_mode: (value) => ({ speed: Number(z.enum(IR_FAN_SPEEDS).parse(value)) }),
};

export function goalOf(commands: readonly DeviceCommand[]): IrApplianceApply {
  return IR_APPLIANCE_APPLY.parse(
    Object.assign(
      {},
      ...commands.map((command) => {
        const goal = GOAL_OF[command.capability];
        if (goal === undefined) {
          throw new CommandRefusedError(command.capability, 'an IR appliance cannot change it');
        }
        return goal(command.value);
      }),
    ),
  );
}

function execute(service: IrApplianceService, command: DeviceCommand): Promise<JsonValue> {
  const applianceId = applianceIdOf(command.externalId);
  if (command.capability === 'remote_key') {
    return service.press(applianceId, z.string().min(1).parse(command.value)).then(() => null);
  }
  return service.apply(applianceId, goalOf([command])).then(() => null);
}

export function applianceDriver(service: IrApplianceService, feed: ChangeFeed): DeviceDriver {
  return {
    id: IR_APPLIANCE_DRIVER,
    start: async (context): Promise<() => Promise<void>> => {
      await service.devices.attach(context);
      const unsubscribe = feed.subscribe((change) => {
        service.devices.observe(change);
      });
      return (): Promise<void> => {
        unsubscribe();
        service.devices.detach();
        return Promise.resolve();
      };
    },
    execute: (command) => execute(service, command),
    executeTogether: async (commands): Promise<JsonValue> => {
      const [first] = commands;
      if (first === undefined) return null;
      await service.apply(applianceIdOf(first.externalId), goalOf(commands));
      return null;
    },
  };
}
