import { API_ENDPOINTS as E, ApiError, type DeviceRow } from '@smarteverything/domain';
import type { WatchActionTarget } from '../../local/watch-actions';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type WatchRoutes = Record<
  | 'listWatchCandidates'
  | 'readPhoneWatches'
  | 'reportWatchState'
  | 'saveWatchRecords'
  | 'readWatchDays'
  | 'runWatchAction'
  | 'answerWatchAction'
  | 'readWatchConfig'
  | 'startWatchWorkout'
  | 'stopWatchWorkout'
  | 'readWatchWorkout',
  Bound
>;

function allowedTarget(context: ServerContext, device: DeviceRow, caller: Caller): WatchActionTarget {
  const target = context.hub.watches.target(device);
  if (clientOf(caller).role !== 'owner' && profileIdOf(context.store, caller) !== target.profileId) {
    throw new ApiError('forbidden', `${target.name} belongs to another person.`);
  }
  return target;
}

function workoutRoutes(
  context: ServerContext,
): Pick<WatchRoutes, 'startWatchWorkout' | 'stopWatchWorkout' | 'readWatchWorkout'> {
  const { store, hub } = context;
  return {
    startWatchWorkout: bound(E.startWatchWorkout, ({ params, body, caller }) =>
      context.watchActions.run(
        allowedTarget(context, store.devices.byId(params.deviceId), caller),
        { type: 'start_workout', sport: body.sport },
        clientOf(caller).id,
      ),
    ),
    stopWatchWorkout: bound(E.stopWatchWorkout, ({ params, caller }) =>
      context.watchActions.run(
        allowedTarget(context, store.devices.byId(params.deviceId), caller),
        { type: 'stop_workout' },
        clientOf(caller).id,
      ),
    ),
    readWatchWorkout: bound(E.readWatchWorkout, ({ params, caller }) => {
      const device = store.devices.byId(params.deviceId);
      allowedTarget(context, device, caller);
      return hub.watches.workout(device);
    }),
  };
}

export function watchRoutes(context: ServerContext): WatchRoutes {
  const { store, hub } = context;
  return {
    ...workoutRoutes(context),
    listWatchCandidates: bound(E.listWatchCandidates, () => hub.watches.candidates()),
    readPhoneWatches: bound(E.readPhoneWatches, ({ caller }) =>
      hub.watches.mine(profileIdOf(store, caller), clientOf(caller).id),
    ),
    reportWatchState: bound(E.reportWatchState, async ({ params, body, caller }) => {
      await hub.watches.report(
        store.devices.byId(params.deviceId),
        profileIdOf(store, caller),
        body,
        clientOf(caller).id,
      );
      return DONE_REPLY;
    }),
    saveWatchRecords: bound(E.saveWatchRecords, ({ params, body, caller }) =>
      hub.watches.save(
        store.devices.byId(params.deviceId),
        profileIdOf(store, caller),
        body,
        clientOf(caller).id,
      ),
    ),
    readWatchDays: bound(E.readWatchDays, ({ query, caller }) =>
      hub.watches.days(profileIdOf(store, caller), query.from, query.to),
    ),
    runWatchAction: bound(E.runWatchAction, ({ params, body, caller }) =>
      context.watchActions.run(
        allowedTarget(context, store.devices.byId(params.deviceId), caller),
        body,
        clientOf(caller).id,
      ),
    ),
    readWatchConfig: bound(E.readWatchConfig, ({ params, caller }) => {
      const device = store.devices.byId(params.deviceId);
      allowedTarget(context, device, caller);
      return hub.watches.config(device);
    }),
    answerWatchAction: bound(E.answerWatchAction, ({ body, caller }) => {
      const { requestId, ...result } = body;
      context.watchActions.answer(clientOf(caller).id, requestId, result);
      return DONE_REPLY;
    }),
  };
}
