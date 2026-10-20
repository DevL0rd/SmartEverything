import { decodeMessage } from './decode';
import { IppStatusError } from './errors';
import { isSuccess, operationName, statusName } from './ops';
import { plainGroups, plainObject, type PlainObject } from './plain';
import { GROUP_TAG } from './tags';

export interface IppResponse {
  readonly status: number;
  readonly requestId: number;
  readonly major: number;
  readonly minor: number;
  readonly statusMessage: string | null;
  readonly operation: PlainObject;
  readonly printer: readonly PlainObject[];
  readonly jobs: readonly PlainObject[];
  readonly subscriptions: readonly PlainObject[];
  readonly events: readonly PlainObject[];
  readonly unsupported: readonly PlainObject[];
}

function statusMessageOf(operation: PlainObject): string | null {
  const text = operation['status-message'];
  return typeof text === 'string' && text !== '' ? text : null;
}

export function parseResponse(bytes: Uint8Array): IppResponse {
  const message = decodeMessage(bytes);
  const operation = plainGroups(message.groups, GROUP_TAG.operation)[0] ?? plainObject([]);
  return {
    status: message.code,
    requestId: message.requestId,
    major: message.major,
    minor: message.minor,
    statusMessage: statusMessageOf(operation),
    operation,
    printer: plainGroups(message.groups, GROUP_TAG.printer),
    jobs: plainGroups(message.groups, GROUP_TAG.job),
    subscriptions: plainGroups(message.groups, GROUP_TAG.subscription),
    events: plainGroups(message.groups, GROUP_TAG.eventNotification),
    unsupported: plainGroups(message.groups, GROUP_TAG.unsupported),
  };
}

export function requireSuccess(operation: number, response: IppResponse): IppResponse {
  if (!isSuccess(response.status)) {
    throw new IppStatusError(
      operationName(operation),
      response.status,
      statusName(response.status),
      response.statusMessage,
    );
  }
  return response;
}
