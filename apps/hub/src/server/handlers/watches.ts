import { API_ENDPOINTS as E, type DeviceRow } from '@smarteverything/domain';
import type { WatchActionTarget } from '../../local/watch-actions';
import { clientOf, ownerOrSelf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

function allowedTarget(
  context: ServerContext,
  device: DeviceRow,
  caller: Caller,
): WatchActionTarget {
  const target = context.hub.watches.target(device);
  ownerOrSelf(clientOf(caller).role, profileIdOf(context.store, caller) === target.profileId);
  return target;
}

const workoutRoutes = (context: ServerContext) =>
  ({
    startWatchWorkout: bound(E.startWatchWorkout, ({ params, body, caller }) =>
      context.watchActions.run(
        allowedTarget(context, context.store.devices.byId(params.deviceId), caller),
        { type: 'start_workout', sport: body.sport },
        clientOf(caller).id,
      ),
    ),
    stopWatchWorkout: bound(E.stopWatchWorkout, ({ params, caller }) =>
      context.watchActions.run(
        allowedTarget(context, context.store.devices.byId(params.deviceId), caller),
        { type: 'stop_workout' },
        clientOf(caller).id,
      ),
    ),
    readWatchWorkout: bound(E.readWatchWorkout, ({ params, caller }) => {
      const device = context.store.devices.byId(params.deviceId);
      allowedTarget(context, device, caller);
      return context.hub.watches.workout(device);
    }),
  }) as const;

const bridgeRoutes = ({ store, hub, watchData }: ServerContext) =>
  ({
    readWatchData: bound(E.readWatchData, ({ caller }) =>
      watchData.dataOf(profileIdOf(store, caller)),
    ),
    takeOverWatchBridge: bound(E.takeOverWatchBridge, ({ params, caller }) =>
      hub.watches.takeOverBridge(
        store.devices.byId(params.deviceId),
        profileIdOf(store, caller),
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
      context.hub.watches.mine(profileIdOf(context.store, caller), clientOf(caller)),
    ),
    reportWatchState: bound(E.reportWatchState, async ({ params, body, caller }) => {
      await context.hub.watches.report(
        context.store.devices.byId(params.deviceId),
        profileIdOf(context.store, caller),
        body,
        clientOf(caller),
      );
      return DONE_REPLY;
    }),
    saveWatchRecords: bound(E.saveWatchRecords, ({ params, body, caller }) =>
      context.hub.watches.save(
        context.store.devices.byId(params.deviceId),
        profileIdOf(context.store, caller),
        body,
        clientOf(caller),
      ),
    ),
    readWatchDays: bound(E.readWatchDays, ({ query, caller }) =>
      context.hub.watches.days(profileIdOf(context.store, caller), query.from, query.to),
    ),
    runWatchAction: bound(E.runWatchAction, ({ params, body, caller }) =>
      context.watchActions.run(
        allowedTarget(context, context.store.devices.byId(params.deviceId), caller),
        body,
        clientOf(caller).id,
      ),
    ),
    readWatchConfig: bound(E.readWatchConfig, ({ params, caller }) => {
      const device = context.store.devices.byId(params.deviceId);
      allowedTarget(context, device, caller);
      return context.hub.watches.config(device);
    }),
    answerWatchAction: bound(E.answerWatchAction, ({ body, caller }) => {
      const { requestId, ...result } = body;
      context.watchActions.answer(clientOf(caller).id, requestId, result);
      return DONE_REPLY;
    }),
  }) as const;
