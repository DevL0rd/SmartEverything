import { ApiError } from '@smarteverything/domain';
import type { RunningExtension } from '../extensions';
import type { OwnerAlerts } from '../extensions/owner-alerts';
import type { WatchOutcome } from '../local/watch-actions';
import { alertOf } from '../planner/sharing/notice-alerts';
import { isWatchDevice } from '../planner/watch-projection';
import type { PlannerChannels } from '../planner/runtime';
import type { Core } from '../services';
import type { ServerContext } from './context';
import { collabOf, followCollab } from './planner-collab';
import { plannerPublicRoutes } from './planner-public-routes';

function refused(cause: unknown): WatchOutcome {
  if (cause instanceof ApiError) return { ok: false, reason: 'refused', detail: cause.message };
  throw cause;
}

async function sendToWatch(
  context: ServerContext,
  deviceId: string,
  action: Parameters<ServerContext['watchActions']['attempt']>[1],
): Promise<WatchOutcome> {
  const device = await context.store.host.call('devices', 'find', deviceId);
  if (device === undefined) {
    return { ok: false, reason: 'refused', detail: 'That watch is no longer added.' };
  }
  try {
    return await context.watchActions.attempt(
      await context.hub.watches.target(device),
      action,
      'planner',
    );
  } catch (cause) {
    return refused(cause);
  }
}

async function profileOfWatch(context: ServerContext, deviceId: string): Promise<string | null> {
  const device = await context.store.host.call('devices', 'find', deviceId);
  if (device === undefined || !isWatchDevice(device)) return null;
  try {
    return (await context.hub.watches.target(device)).profileId;
  } catch (cause) {
    if (cause instanceof ApiError) return null;
    throw cause;
  }
}

function plannerChannels(
  context: ServerContext,
  alerts: Pick<OwnerAlerts, 'raise'>,
): PlannerChannels {
  const { live } = context;
  return {
    phone: {
      send: async (clientId) => (await live.deliver(clientId, { type: 'planner_phone_rings' })) > 0,
    },
    bedtime: {
      deliver: async (clientId, notice) => (await live.deliver(clientId, notice)) > 0,
      push: (alert): void => {
        alerts.raise(alert);
      },
    },
    watch: { send: (deviceId, action) => sendToWatch(context, deviceId, action) },
    profileOfWatch: (deviceId) => profileOfWatch(context, deviceId),
  };
}

function forwardNotices(context: ServerContext, alerts: Pick<OwnerAlerts, 'raise'>): () => void {
  const { live, store } = context;
  let order: Promise<void> = Promise.resolve();
  const inOrder = (work: () => Promise<void> | void): void => {
    order = order.then(work).catch((cause: unknown) => {
      context.log.error('planner.notice_failed', cause);
    });
  };
  return store.feed.subscribeNotices((notice) => {
    if (notice.type === 'planner_summary') {
      inOrder(() => {
        live.profileNotice(notice, notice.personId, 'everyone');
      });
    } else if (notice.type === 'planner_ring') {
      inOrder(async () => {
        const ring = await store.host.call('plannerRings', 'find', notice.ringId);
        if (ring !== undefined) live.profileNotice(notice, ring.profile_id, 'everyone');
      });
    } else if (
      notice.type === 'planner_invited' ||
      notice.type === 'planner_rsvp' ||
      notice.type === 'planner_assigned'
    ) {
      inOrder(() => {
        live.profileNotice(notice, notice.personId, 'everyone');
        alerts.raise(alertOf(notice));
      });
    }
  });
}

export function startPlanner(
  core: Pick<Core, 'planner'>,
  context: ServerContext,
  alerts: Pick<OwnerAlerts, 'raise'>,
  now: () => Date,
): RunningExtension {
  core.planner.start(plannerChannels(context, alerts));
  const stopForwarding = forwardNotices(context, alerts);
  const collab = collabOf(context, now);
  const stopCollab = followCollab(collab, context, alerts);
  return {
    endpoints: {},
    routes: plannerPublicRoutes(collab),
    stop: (): Promise<void> => {
      stopCollab();
      stopForwarding();
      core.planner.stop();
      return Promise.resolve();
    },
  };
}
