import { ApiError } from '@smarteverything/domain';
import type { RunningExtension } from '../extensions';
import type { WatchOutcome } from '../local/watch-actions';
import { isWatchDevice } from '../planner/watch-projection';
import type { PlannerChannels } from '../planner/runtime';
import type { Core } from '../services';
import type { ServerContext } from './context';

function refused(cause: unknown): WatchOutcome {
  if (cause instanceof ApiError) return { ok: false, reason: 'refused', detail: cause.message };
  throw cause;
}

async function sendToWatch(
  context: ServerContext,
  deviceId: string,
  action: Parameters<ServerContext['watchActions']['attempt']>[1],
): Promise<WatchOutcome> {
  const device = context.store.devices.find(deviceId);
  if (device === undefined) {
    return { ok: false, reason: 'refused', detail: 'That watch is no longer added.' };
  }
  try {
    return await context.watchActions.attempt(
      context.hub.watches.target(device),
      action,
      'planner',
    );
  } catch (cause) {
    return refused(cause);
  }
}

function profileOfWatch(context: ServerContext, deviceId: string): string | null {
  const device = context.store.devices.find(deviceId);
  if (device === undefined || !isWatchDevice(device)) return null;
  try {
    return context.hub.watches.target(device).profileId;
  } catch (cause) {
    if (cause instanceof ApiError) return null;
    throw cause;
  }
}

function plannerChannels(context: ServerContext): PlannerChannels {
  const { live } = context;
  return {
    phone: {
      send: (clientId) =>
        Promise.resolve(
          live.connectedClients().has(clientId) || live.backgroundClients().has(clientId),
        ),
    },
    watch: { send: (deviceId, action) => sendToWatch(context, deviceId, action) },
    profileOfWatch: (deviceId) => profileOfWatch(context, deviceId),
  };
}

function forwardNotices(context: ServerContext): () => void {
  const { live, store } = context;
  return store.feed.subscribeNotices((notice) => {
    if (notice.type === 'planner_summary') {
      live.profileNotice(notice, notice.personId, 'everyone');
    } else if (notice.type === 'planner_ring') {
      const ring = store.plannerRings.find(notice.ringId);
      if (ring !== undefined) live.profileNotice(notice, ring.profile_id, 'everyone');
    }
  });
}

export function startPlanner(
  core: Pick<Core, 'planner'>,
  context: ServerContext,
): RunningExtension {
  core.planner.start(plannerChannels(context));
  const stopForwarding = forwardNotices(context);
  return {
    endpoints: {},
    routes: [],
    stop: (): Promise<void> => {
      stopForwarding();
      core.planner.stop();
      return Promise.resolve();
    },
  };
}
