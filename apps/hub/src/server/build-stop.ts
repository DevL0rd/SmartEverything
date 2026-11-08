import type { ServerContext } from './context';
import type { BuildOptions } from './build';
import { ingestOwnLogs } from './hub-log-sink';
import { storeStartupJournal } from './startup-journal';
import type { Serving } from './build';
import {
  followNetworkSettings,
  startClocks,
  stopAssistantServices,
  stopComputersAndServing,
  subscribeLive,
} from './build';
import type { startHubHarness } from './harness-wiring';

interface Stopping {
  readonly harness: Awaited<ReturnType<typeof startHubHarness>>;
  readonly served: Serving;
  readonly unsubscribe: () => void;
  readonly unfollowLive: () => void;
  readonly stopWatches: () => void;
  readonly stopHomeServices: () => void;
  readonly stopOwnLogs: () => void;
}

export function stopping(
  options: BuildOptions,
  context: ServerContext,
  parts: Stopping,
): () => Promise<void> {
  return async (): Promise<void> => {
    parts.unsubscribe();
    parts.served.cameraSockets.stop();
    await stopAssistantServices(context);
    await parts.harness?.dispose();
    parts.unfollowLive();
    parts.stopOwnLogs();
    context.live.stop();
    parts.stopWatches();
    parts.stopHomeServices();
    context.talk.stop();
    context.weather.stop();
    context.exchangeRates.stop();
    stopComputersAndServing(context, parts.served);
    await parts.served.drive.stop();
    await parts.served.claude.settled();
    context.openRouter.stop();
    parts.served.schedules.scheduler.stop();
    parts.served.voice.stop().catch((cause: unknown) => {
      options.log.error('voice.stop_failed', cause);
    });
  };
}

export function starting(
  options: BuildOptions,
  context: ServerContext,
  parts: Pick<Stopping, 'harness' | 'served' | 'stopWatches' | 'stopHomeServices'>,
): () => Promise<void> {
  const unfollowLive = subscribeLive(options, context.live);
  const stopOwnLogs = ingestOwnLogs(options);
  void storeStartupJournal(options.store, options.log).catch((cause: unknown) => {
    options.log.warn('journal.read_failed', {
      reason: cause instanceof Error ? cause.name : 'unknown',
    });
  });
  startClocks(context);
  return stopping(options, context, {
    ...parts,
    unsubscribe: followNetworkSettings(options, context),
    unfollowLive,
    stopOwnLogs,
  });
}
