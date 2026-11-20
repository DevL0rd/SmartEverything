import type { ServerContext } from './context';
import type { BuildOptions, Serving } from './build';
import { ingestOwnLogs } from './hub-log-sink';
import { storeStartupJournal } from './startup-journal';
import type { LiveHub } from './live';
import type { startHubHarness } from './harness-wiring';

function followNetworkSettings(options: BuildOptions, context: ServerContext): () => void {
  return options.store.feed.subscribe((change) => {
    if (change.table !== 'settings' || change.record === null) {
      return;
    }
    options.core.supervisor
      .apply({ candidates: change.record.webrtc_candidates, iceServers: change.record.ice_servers })
      .then(
        () => {
          context.live.presence();
        },
        (cause: unknown) => {
          context.log.error('go2rtc.reconfigure_failed', cause);
        },
      );
  });
}

function startClocks(context: ServerContext): void {
  context.access.lifecycle.start();
  context.weather.start();
  context.exchangeRates.start();
  context.openRouter.start();
  context.harness.skillUpdates.start();
}

function stopServing(served: Serving): void {
  served.stopRepair();
  served.detachTrace();
  served.memory.stop();
  served.reconciler.stop();
  served.budget.stop();
  served.reach.stop();
  served.transcribing.transcripts.stop();
  served.claude.stop();
}

function subscribeLive(options: BuildOptions, live: LiveHub): () => void {
  const unfollowFirewall = options.core.firewall.onChange((firewall) => {
    live.firewall(firewall);
  });
  const unfollowLog = options.logLines.listen((lines) => {
    live.announce({ type: 'service_log', lines: [...lines] }, 'service_log');
  });
  return (): void => {
    unfollowFirewall();
    unfollowLog();
  };
}

function stopComputersAndServing(context: ServerContext, served: Serving): void {
  context.access.lifecycle.stop();
  context.harnessSockets.stop();
  context.nodeSockets.stop();
  context.computerAi.stop();
  context.machineApprovals.stop();
  stopServing(served);
}

async function stopAssistantServices(context: ServerContext): Promise<void> {
  await context.harness.skillUpdates.stop();
  context.assistant.stop();
  await context.imageRuntime.stop();
  context.browser.stop();
}

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
  void storeStartupJournal(options.store, options.logs, options.log).catch((cause: unknown) => {
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
