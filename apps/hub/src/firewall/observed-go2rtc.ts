import { Go2rtcError, type Go2rtcClient, type Go2rtcMotor } from '../cameras/go2rtc-client';

export class CameraBlockedByFirewallError extends Error {
  override readonly name = 'CameraBlockedByFirewallError';

  constructor(
    readonly deviceId: string,
    readonly address: string,
    cause: Go2rtcError,
  ) {
    super(
      `The firewall on this computer has no rule letting in the video the camera at ${address} sends, so its stream could not start; allow it in Settings. go2rtc said: ${cause.message}`,
    );
  }
}

export interface StreamWatch {
  readonly streamOpening: (deviceId: string) => void;
  readonly streamSettled: (deviceId: string, succeeded: boolean) => void;
  readonly blockingAddress: (deviceId: string) => string | null;
}

type Client = Go2rtcClient & Go2rtcMotor;

export function observedGo2rtc(client: Client, watch: StreamWatch): Client {
  const observe = async <T>(stream: string, run: () => Promise<T>): Promise<T> => {
    watch.streamOpening(stream);
    try {
      const result = await run();
      watch.streamSettled(stream, true);
      return result;
    } catch (cause) {
      watch.streamSettled(stream, false);
      const address = watch.blockingAddress(stream);
      if (address !== null && cause instanceof Go2rtcError) {
        throw new CameraBlockedByFirewallError(stream, address, cause);
      }
      throw cause;
    }
  };
  return {
    ...client,
    answer: (stream, offer) => observe(stream, () => client.answer(stream, offer)),
    frame: (stream, size, signal) => observe(stream, () => client.frame(stream, size, signal)),
    clip: (stream, seconds) => observe(stream, () => client.clip(stream, seconds)),
  };
}
