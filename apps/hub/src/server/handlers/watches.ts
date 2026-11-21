import { API_ENDPOINTS as E, type DeviceRow } from '@smarteverything/domain';
import type { WatchActionTarget } from '../../local/watch-actions';
import { clientOf, ownerOrSelf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

async function allowedTarget(
  context: ServerContext,
  device: DeviceRow,
  caller: Caller,
): Promise<WatchActionTarget> {
  const target = await context.hub.watches.target(device);
  ownerOrSelf(clientOf(caller).role, profileIdOf(caller) === target.profileId);
  return target;
}

const workoutRoutes = (context: ServerContext) =>
  ({
    startWatchWorkout: bound(E.startWatchWorkout, async ({ params, body, caller }) =>
      context.watchActions.run(
        await allowedTarget(
          context,
          await context.store.host.call('devices', 'byId', params.deviceId),
          caller,
        ),
        { type: 'start_workout', sport: body.sport },
        clientOf(caller).id,
      ),
    ),
    stopWatchWorkout: bound(E.stopWatchWorkout, async ({ params, caller }) =>
      context.watchActions.run(
        await allowedTarget(
          context,
          await context.store.host.call('devices', 'byId', params.deviceId),
          caller,
        ),
        { type: 'stop_workout' },
        clientOf(caller).id,
      ),
    ),
    readWatchWorkout: bound(E.readWatchWorkout, async ({ params, caller }) => {
      const device = await context.store.host.call('devices', 'byId', params.deviceId);
      await allowedTarget(context, device, caller);
      return context.hub.watches.workout(device);
    }),
  }) as const;

const bridgeRoutes = ({ store, hub, watchData }: ServerContext) =>
  ({
    readWatchData: bound(E.readWatchData, ({ caller }) => watchData.dataOf(profileIdOf(caller))),
    takeOverWatchBridge: bound(E.takeOverWatchBridge, async ({ params, caller }) =>
      hub.watches.takeOverBridge(
        await store.host.call('devices', 'byId', params.deviceId),
        profileIdOf(caller),
        clientOf(caller),
      ),
    ),
  }) as const;

export const watchRoutes = (context: ServerContext) =>
  ({
    ...workoutRoutes(context),
    ...bridgeRoutes(context),
    listWatchCandidates: bound(E.listWatchCandidates, () => context.hub.watches.candidates()),
    readPhoneWatches: bound(E.readPhoneWatches, ({ caller }) =>
      context.hub.watches.mine(profileIdOf(caller), clientOf(caller)),
    ),
    reportWatchState: bound(E.reportWatchState, async ({ params, body, caller }) => {
      await context.hub.watches.report(
        await context.store.host.call('devices', 'byId', params.deviceId),
        profileIdOf(caller),
        body,
        clientOf(caller),
      );
      return DONE_REPLY;
    }),
    saveWatchRecords: bound(E.saveWatchRecords, async ({ params, body, caller }) =>
      context.hub.watches.save(
        await context.store.host.call('devices', 'byId', params.deviceId),
        profileIdOf(caller),
        body,
        clientOf(caller),
      ),
    ),
    readWatchDays: bound(E.readWatchDays, ({ query, caller }) =>
      context.hub.watches.days(profileIdOf(caller), query.from, query.to),
    ),
    runWatchAction: bound(E.runWatchAction, async ({ params, body, caller }) =>
      context.watchActions.run(
        await allowedTarget(
          context,
          await context.store.host.call('devices', 'byId', params.deviceId),
          caller,
        ),
        body,
        clientOf(caller).id,
      ),
    ),
    readWatchConfig: bound(E.readWatchConfig, async ({ params, caller }) => {
      const device = await context.store.host.call('devices', 'byId', params.deviceId);
      await allowedTarget(context, device, caller);
      return context.hub.watches.config(device);
    }),
    answerWatchAction: bound(E.answerWatchAction, ({ body, caller }) => {
      const { requestId, ...result } = body;
      context.watchActions.answer(clientOf(caller).id, requestId, result);
      return DONE_REPLY;
    }),
  }) as const;
