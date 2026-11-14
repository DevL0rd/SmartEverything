import { readFile } from 'node:fs/promises';
import { UPDATE_PUSH_PATH, ApiError } from '@smarteverything/domain';
import { sendJson } from '../http';
import type { RawRoute } from '../http-server';
import { decidePush, readSignedPush, type PushTarget } from '../../self-update/push-webhook';

const GITHUB_PUSH_LIMIT = 25 * 1024 * 1024;

export interface PushIntake {
  readonly secret: () => Promise<string | null>;
  readonly target: () => Promise<PushTarget>;
  readonly submit: (push: { readonly tip: string; readonly pushedFrom: string }) => Promise<string>;
}

export async function readPushSecret(file: string): Promise<string | null> {
  try {
    const secret = (await readFile(file, 'utf8')).trim();
    return secret.length === 0 ? null : secret;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
    throw cause;
  }
}

function headerOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function jsonOf(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch (cause) {
    throw new ApiError(
      'invalid_request',
      `The push notification is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}.`,
    );
  }
}

export function updatePushRoute(intake: PushIntake): RawRoute {
  return {
    method: 'POST',
    path: UPDATE_PUSH_PATH,
    handle: async (request, response): Promise<void> => {
      const secret = await intake.secret();
      if (secret === null)
        throw new ApiError('not_found', 'This hub has no update webhook set up.');
      const presented = headerOf(request.headers['x-hub-signature-256']);
      if (presented === undefined)
        throw new ApiError('unauthorized', 'The push notification signature is missing.');
      const body = await readSignedPush(request, secret, presented, GITHUB_PUSH_LIMIT);
      if (body === null)
        throw new ApiError('unauthorized', 'The push notification signature is not valid.');
      const event = headerOf(request.headers['x-github-event']);
      const decision = decidePush(event, jsonOf(body), await intake.target());
      if (decision.kind === 'malformed')
        throw new ApiError('invalid_request', 'The push notification is not a valid GitHub push.');
      if (decision.kind !== 'accepted') {
        sendJson(response, 200, decision);
        return;
      }
      const revisionId = await intake.submit({ tip: decision.tip, pushedFrom: decision.before });
      sendJson(response, 202, { kind: 'queued', revisionId });
    },
  };
}
