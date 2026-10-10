import { CommandRefusedError } from '@smarteverything/domain';
import type { MotorOperation } from '@smarteverything/xiaomi';
import { Go2rtcError, type Go2rtcMotor } from '../../cameras/go2rtc-client';

export interface CameraMotor {
  readonly move: (did: string, operation: MotorOperation) => Promise<void>;
}

const HTTP_CONFLICT = 409;

export function go2rtcCameraMotor(
  client: Go2rtcMotor,
  streamOf: (did: string) => string | null,
): CameraMotor {
  return {
    move: async (did, operation): Promise<void> => {
      const stream = streamOf(did);
      if (stream === null) {
        throw new CommandRefusedError('ptz', `camera ${did} has no go2rtc stream on this hub`);
      }
      try {
        await client.motor(stream, operation);
      } catch (error) {
        if (error instanceof Go2rtcError && error.status === HTTP_CONFLICT) {
          throw new CommandRefusedError(
            'ptz',
            'the camera moves only while its stream is playing; open its live view and try again',
          );
        }
        throw error;
      }
    },
  };
}
