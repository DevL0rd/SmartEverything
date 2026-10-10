import {
  CommandRefusedError,
  type CapabilityKey,
  type DeviceCapability,
  type JsonValue,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  positionsReading,
  presetWrite,
  ptzCapabilities,
  ptzStep,
  type MotorOperation,
  type PropertyReading,
  type PtzPlan,
  type PtzPosition,
} from '@smarteverything/xiaomi';
import type { CameraMotor } from './camera-motor';
import type { DeviceIo } from './device-io';

export const NO_MOTOR_ENDPOINT = "this hub was started without go2rtc's Xiaomi motor endpoint";

export interface PtzCamera {
  readonly did: string;
  readonly model: string;
  readonly plan: PtzPlan;
}

export class CameraPtz {
  private positions: readonly PtzPosition[] = [];

  constructor(
    private readonly camera: PtzCamera,
    private readonly motor: CameraMotor | null,
    private readonly log: Logger,
  ) {}

  capabilities(): DeviceCapability[] {
    return ptzCapabilities(this.camera.plan, this.positions);
  }

  handles(capability: CapabilityKey): boolean {
    return capability === 'ptz' || capability === 'ptz_preset';
  }

  observe(reading: PropertyReading): boolean {
    const read = positionsReading(this.camera.plan, reading);
    if (read === null) {
      return false;
    }
    if (read.malformed.length > 0) {
      this.log.warn('xiaomi_camera.positions_unreadable', {
        did: this.camera.did,
        problems: [...read.malformed],
      });
    }
    const changed = JSON.stringify(read.positions) !== JSON.stringify(this.positions);
    this.positions = read.positions;
    return changed;
  }

  async load(io: DeviceIo): Promise<void> {
    const slots = this.camera.plan.presets;
    if (slots === null) {
      return;
    }
    try {
      for (const reading of await io.read([slots.list])) {
        this.observe(reading);
      }
    } catch (error) {
      this.log.warn('xiaomi_camera.positions_failed', {
        did: this.camera.did,
        transport: io.transport,
        reason: String(error),
      });
    }
  }

  async execute(capability: CapabilityKey, value: JsonValue, io: DeviceIo): Promise<JsonValue> {
    const { did, model, plan } = this.camera;
    if (capability === 'ptz_preset') {
      const write = presetWrite(plan, this.positions, value);
      await io.write([write]);
      this.log.info('xiaomi_camera.position_chosen', {
        did,
        slot: write.value,
        transport: io.transport,
      });
      return value;
    }
    const step = ptzStep(plan, model, value);
    switch (step.kind) {
      case 'miio':
        this.log.info('xiaomi_camera.ptz_moved', { did, via: 'miio', transport: io.transport });
        return io.miio(step.method, step.params);
      case 'action':
        this.log.info('xiaomi_camera.ptz_moved', { did, via: 'action', transport: io.transport });
        return io.action(step.action, []);
      case 'motor':
        return this.moveOverSession(step.operation, value);
    }
  }

  private async moveOverSession(operation: MotorOperation, value: JsonValue): Promise<JsonValue> {
    const { did } = this.camera;
    if (this.motor === null) {
      throw new CommandRefusedError('ptz', NO_MOTOR_ENDPOINT);
    }
    await this.motor.move(did, operation);
    this.log.info('xiaomi_camera.ptz_moved', { did, via: 'go2rtc', operation });
    return value;
  }
}
