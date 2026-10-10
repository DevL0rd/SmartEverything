import { API_ENDPOINTS as E, ApiError, type DeviceRow } from '@smarteverything/domain';
import type { RunningHub } from '../hub';
import { clientOf, profileIdOf, type Caller } from '../server/auth';
import { DONE_REPLY, bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import type { PhoneActionBroker } from './phone-actions';
import type { PhoneTarget } from './phone-nodes';

export type PhoneEndpointName =
  'reportPhone' | 'runPhoneAction' | 'answerPhoneAction' | 'readPhoneContext';

export interface PhoneRouteContext {
  readonly store: Store;
  readonly hub: RunningHub;
  readonly actions: PhoneActionBroker;
}

function allowedTarget(context: PhoneRouteContext, device: DeviceRow, caller: Caller): PhoneTarget {
  const target = context.hub.phones.target(device);
  if (
    clientOf(caller).role !== 'owner' &&
    profileIdOf(context.store, caller) !== target.profileId
  ) {
    throw new ApiError('forbidden', `${target.name} belongs to another person.`);
  }
  return target;
}

export function phoneRoutes(context: PhoneRouteContext): Record<PhoneEndpointName, Bound> {
  const { store, hub, actions } = context;
  return {
    reportPhone: bound(E.reportPhone, async ({ body, caller }) => {
      const client = clientOf(caller);
      if (client.platform !== 'android') {
        throw new ApiError('invalid_request', 'Only the Android app reports as a phone.');
      }
      await hub.phones.report(
        { clientId: client.id, name: client.name, profileId: profileIdOf(store, caller) },
        body,
      );
      return DONE_REPLY;
    }),
    runPhoneAction: bound(E.runPhoneAction, ({ params, body, caller }) =>
      actions.run(
        allowedTarget(context, store.devices.byId(params.deviceId), caller),
        body,
        clientOf(caller).id,
      ),
    ),
    answerPhoneAction: bound(E.answerPhoneAction, ({ body, caller }) => {
      const { requestId, ...result } = body;
      actions.answer(clientOf(caller).id, requestId, result);
      return DONE_REPLY;
    }),
    readPhoneContext: bound(E.readPhoneContext, ({ query, caller }) =>
      hub.phones.contextOf(query.profileId, profileIdOf(store, caller)),
    ),
  };
}
