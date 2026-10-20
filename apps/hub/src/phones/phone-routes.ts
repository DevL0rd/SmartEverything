import {
  API_ENDPOINTS as E,
  machineActionOfPhoneAction,
  type DeviceRow,
  type PhoneAction,
  type PhoneActionOrigin,
  type PhoneActionResult,
  type PhoneFilePush,
} from '@smarteverything/domain';
import type { RunningHub } from '../hub';
import { clientOf, profileIdOf, type Caller } from '../server/auth';
import { DONE_REPLY, bound, type Routes } from '../server/router';
import type { Store } from '../store/store';
import type { MachineApprovals } from '../machines/approval';
import type { LiveNotifications } from '../server/live-notifications';
import { assertPhoneActionAllowed } from './phone-access';
import { androidOnly, phoneIdentityOf } from './phone-identity';
import type { PhoneActionBroker } from './phone-actions';
import { readPhoneDetail, tierOfViewer, phoneViewerOfCaller } from './phone-detail';
import { readPhoneIcon, savePhoneIcon } from './phone-icons';
import type { PhoneTarget } from './phone-nodes';

export type PhoneEndpointName =
  | 'reportPhone'
  | 'runPhoneAction'
  | 'answerPhoneAction'
  | 'readPhoneContext'
  | 'readPhoneDetail'
  | 'uploadPhoneIcon'
  | 'readPhoneIcon';

export interface PhoneRouteContext {
  readonly store: Store;
  readonly hub: Pick<RunningHub, 'phones'>;
  readonly actions: Pick<PhoneActionBroker, 'run' | 'answer'>;
  readonly approvals: Pick<MachineApprovals, 'has' | 'answer'>;
  readonly notifications: Pick<LiveNotifications, 'has' | 'answer'>;
  readonly now: () => Date;
  readonly files: (caller: Caller, fileId: string) => PhoneFilePush;
}

function allowedTarget(
  context: PhoneRouteContext,
  device: DeviceRow,
  caller: Caller,
  action: PhoneAction,
): PhoneTarget {
  const target = context.hub.phones.target(device);
  assertPhoneActionAllowed(
    action.type,
    tierOfViewer(target, phoneViewerOfCaller(context.store, caller)),
  );
  return target;
}

function originOf(caller: Caller): PhoneActionOrigin {
  const assistant =
    caller.kind === 'service' || (caller.kind === 'client' && caller.via === 'assistant');
  return { source: assistant ? 'assistant' : 'app', client: clientOf(caller).name };
}

function recordAction(
  context: PhoneRouteContext,
  device: DeviceRow,
  action: PhoneAction,
  origin: PhoneActionOrigin,
): void {
  const machine = machineActionOfPhoneAction(action);
  if (machine === null) {
    return;
  }
  context.hub.phones.recordAction(device, machine, origin, context.now());
}

function answerRequest(
  { actions, approvals, notifications }: PhoneRouteContext,
  answerer: string,
  { requestId, ...result }: PhoneActionResult & { readonly requestId: string },
): void {
  if (approvals.has(requestId)) {
    approvals.answer(answerer, requestId, result);
  } else if (notifications.has(requestId)) {
    notifications.answer(answerer, requestId, result);
  } else {
    actions.answer(answerer, requestId, result);
  }
}

export function phoneRoutes(context: PhoneRouteContext): Routes<PhoneEndpointName> {
  const { store, hub, actions, files } = context;
  return {
    reportPhone: bound(E.reportPhone, async ({ body, caller }) => {
      await hub.phones.report(phoneIdentityOf(store, caller, 'reports as a phone'), body);
      return DONE_REPLY;
    }),
    runPhoneAction: bound(E.runPhoneAction, async ({ params, body, caller }) => {
      const device = store.devices.byId(params.deviceId);
      const target = allowedTarget(context, device, caller, body);
      const origin = originOf(caller);
      const asked = body.type === 'receive_file' ? files(caller, body.fileId) : body;
      const result = await actions.run(target, asked, origin);
      if (result.ok) {
        recordAction(context, device, body, origin);
      }
      return result;
    }),
    answerPhoneAction: bound(E.answerPhoneAction, ({ body, caller }) => {
      answerRequest(context, clientOf(caller).id, body);
      return DONE_REPLY;
    }),
    readPhoneContext: bound(E.readPhoneContext, ({ query, caller }) =>
      hub.phones.contextOf(query.profileId, profileIdOf(store, caller)),
    ),
    readPhoneDetail: bound(E.readPhoneDetail, ({ params, query, caller }) =>
      readPhoneDetail(
        store,
        hub.phones.target(store.devices.byId(params.deviceId)),
        phoneViewerOfCaller(store, caller),
        query.sections,
      ),
    ),
    uploadPhoneIcon: bound(E.uploadPhoneIcon, ({ body, caller }) => {
      androidOnly(caller, 'uploads app icons');
      savePhoneIcon(store, body);
      return DONE_REPLY;
    }),
    readPhoneIcon: bound(E.readPhoneIcon, ({ params }) => readPhoneIcon(store, params.hash)),
  };
}
