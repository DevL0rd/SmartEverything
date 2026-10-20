import type { CameraRefusals } from '../cameras/camera-health';
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

export type CameraRequestCounts = Readonly<Record<string, number>>;

export class CameraLoad {
  private readonly open = new Map<string, Map<string, number>>();

  begin(deviceId: string, operation: string): () => void {
    const counts = this.open.get(deviceId) ?? new Map<string, number>();
    this.open.set(deviceId, counts);
    counts.set(operation, (counts.get(operation) ?? 0) + 1);
    return () => {
      const remaining = (counts.get(operation) ?? 1) - 1;
      if (remaining === 0) {
        counts.delete(operation);
      } else {
        counts.set(operation, remaining);
      }
    };
  }

  of(deviceId: string): CameraRequestCounts {
    return Object.fromEntries(this.open.get(deviceId) ?? []);
  }
}

export interface CameraWatch {
  readonly load: Pick<CameraLoad, 'begin'>;
  readonly refusal: CameraRefusals;
  readonly failed: (deviceId: string) => void;
  readonly recovered: (deviceId: string) => void;
  readonly blockingAddress: (deviceId: string) => string | null;
}

type Client = Go2rtcClient & Go2rtcMotor;

const UDP_TIMEOUT = 'i/o timeout';

function timedOut(cause: unknown, signal: AbortSignal | undefined): boolean {
  return (
    signal?.aborted === true ||
    (cause instanceof Go2rtcError && cause.message.includes(UDP_TIMEOUT))
  );
}

export function observedGo2rtc(client: Client, watch: CameraWatch): Client {
  const observe = async <T>(
    stream: string,
    operation: string,
    run: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> => {
    const deviceId = stream;
    const refusal = watch.refusal(deviceId);
    if (refusal !== null) {
      throw refusal;
    }
    const finish = watch.load.begin(deviceId, operation);
    try {
      const result = await run();
      watch.recovered(deviceId);
      return result;
    } catch (cause) {
      if (timedOut(cause, signal)) {
        watch.failed(deviceId);
      }
      const address = watch.blockingAddress(deviceId);
      if (address !== null && cause instanceof Go2rtcError) {
        throw new CameraBlockedByFirewallError(stream, address, cause);
      }
      throw cause;
    } finally {
      finish();
    }
  };
  return {
    ...client,
    answer: (stream, offer) => observe(stream, 'answer', () => client.answer(stream, offer)),
    frame: (stream, size, signal) =>
      observe(stream, 'frame', () => client.frame(stream, size, signal), signal),
    clip: (stream, seconds) => observe(stream, 'clip', () => client.clip(stream, seconds)),
    play: (stream, source) => observe(stream, 'play', () => client.play(stream, source)),
  };
}
