import { platform } from 'node:process';
import { SessionBus } from '../../../node/controls/linux/dbus-session';
import { watchAvahiNetwork } from '../../../network/avahi-network';

class AibiAddressWatchUnavailableError extends Error {
  override readonly name = 'AibiAddressWatchUnavailableError';

  constructor() {
    super('Automatic AIBI address updates require the Linux Avahi network provider');
  }
}

export async function watchAibiAddress(
  changed: () => void,
  failed: (cause: unknown) => void,
  signal: AbortSignal,
): Promise<() => Promise<void>> {
  if (platform !== 'linux') throw new AibiAddressWatchUnavailableError();
  const bus = SessionBus.system();
  bus.onError(failed);
  try {
    const stop = await watchAvahiNetwork(bus, changed, failed, signal);
    return async (): Promise<void> => {
      try {
        await stop();
      } finally {
        bus.close();
      }
    };
  } catch (cause) {
    bus.close();
    throw cause;
  }
}
