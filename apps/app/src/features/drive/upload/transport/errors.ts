import { z } from 'zod';
import { API_ERROR } from '@smarteverything/domain';
import { jsonText } from '../../../../format/json-text';
import { DetailedError, type HttpResponse } from 'tus-js-client';
import type { UploadFailure, UploadOutcome } from './types';

export const ITEM_ID_HEADER = 'Upload-Item-Id';

export const ITEM_NAME_HEADER = 'Upload-Item-Name';

const ITEM_ID = z.uuid();

const FAILURE_BY_REASON: Readonly<Record<string, UploadFailure>> = {
  over_quota: { kind: 'over-quota' },
  no_space: { kind: 'no-space' },
  read_only_root: { kind: 'read-only-root' },
};

const ALREADY_HAVE_REASON = 'already_have';

function failed(failure: UploadFailure): UploadOutcome {
  return { kind: 'failed', failure };
}

function envelopeOf(body: string): z.infer<typeof API_ERROR> | null {
  const text = jsonText(body);
  if (!text.ok) return null;
  const parsed = API_ERROR.safeParse(text.value);
  return parsed.success ? parsed.data : null;
}

function itemIdOf(response: HttpResponse): string | null {
  const parsed = ITEM_ID.safeParse(response.getHeader(ITEM_ID_HEADER));
  return parsed.success ? parsed.data : null;
}

function rejected(response: HttpResponse, message: string): UploadOutcome {
  return failed({ kind: 'rejected', status: response.getStatus(), message });
}

function outcomeOfHave(response: HttpResponse): UploadOutcome {
  const itemId = itemIdOf(response);
  return itemId === null
    ? rejected(response, 'The hub has this file but did not name the item.')
    : { kind: 'already-have', itemId };
}

function outcomeOfRefusal(response: HttpResponse): UploadOutcome {
  const status = response.getStatus();
  const envelope = envelopeOf(response.getBody());
  const reason = envelope?.error.reason;
  if (reason === ALREADY_HAVE_REASON) return outcomeOfHave(response);
  const known = reason === undefined ? undefined : FAILURE_BY_REASON[reason];
  if (known !== undefined) return failed(known);
  if (status === 401) return failed({ kind: 'session-refused' });
  if (status === 404 || status === 410) return failed({ kind: 'session-expired' });
  return rejected(response, envelope?.error.message ?? `The hub answered HTTP ${String(status)}.`);
}

export function outcomeOfError(error: Error): UploadOutcome {
  if (!(error instanceof DetailedError)) {
    return failed({ kind: 'client-error', message: error.message });
  }
  if (error.originalResponse === null) {
    return failed({
      kind: 'hub-unreachable',
      reason: error.causingError?.message ?? error.message,
    });
  }
  return outcomeOfRefusal(error.originalResponse);
}

export function outcomeOfSuccess(response: HttpResponse, requestedName: string): UploadOutcome {
  const itemId = itemIdOf(response);
  if (itemId === null) return rejected(response, 'The hub stored the file but did not name it.');
  const header = response.getHeader(ITEM_NAME_HEADER);
  const name = header === undefined ? requestedName : decodeURIComponent(header);
  return { kind: 'done', itemId, name, renamed: name !== requestedName };
}
