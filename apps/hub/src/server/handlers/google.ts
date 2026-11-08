import {
  API_ENDPOINTS as E,
  ApiError,
  type GoogleProduct,
  type GoogleSyncLogEntry,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { z } from 'zod';
import { GoogleLinkError, type LinkFailure } from '../../google/link';
import type { GoogleAccessLevel, GoogleRequest } from '../../google/oauth';
import type { PushOutcome } from '../../google/push-receiver';
import type { GoogleAccountPatch } from '../../store/repositories/google-accounts';
import type { GoogleHub } from '../../services';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { plannerProfileOf } from './planner-items';

export type GoogleContext = Pick<ServerContext, 'store' | 'secrets'>;

export type GoogleServices = Pick<GoogleHub, 'link' | 'runner' | 'channels' | 'receiver' | 'tasks'>;

const LINK_REFUSALS: Readonly<Record<LinkFailure, () => ApiError>> = {
  client_missing: () =>
    new ApiError('conflict', 'Enter the Google client ids in the Google settings first.'),
  state_mismatch: () =>
    new ApiError(
      'invalid_request',
      'This Google link was not started for you or has already finished. Start it again.',
    ),
  redirect_mismatch: () =>
    new ApiError('invalid_request', 'The redirect address is not the one the link started with.'),
  refused: () => new ApiError('upstream_failed', 'Google refused the sign-in.'),
  no_refresh_token: () =>
    new ApiError(
      'upstream_failed',
      'Google did not hand out a refresh token. Remove the app’s access in your Google account and link again.',
    ),
};

const PUSH_HEADERS = z.looseObject({
  headers: z.record(z.string(), z.union([z.string(), z.array(z.string())]).optional()).default({}),
});

type PushHeaders = z.output<typeof PUSH_HEADERS>['headers'];

export interface PushRequest {
  readonly channelId: string;
  readonly headers: PushHeaders;
}

function headerOf(headers: PushHeaders, name: string): string | null {
  const value = headers[name];
  if (value === undefined) return null;
  return typeof value === 'string' ? value : (value[0] ?? null);
}

export function receivePush(receiver: GoogleServices['receiver'], request: PushRequest): void {
  const outcome: PushOutcome = receiver.receive({
    channelId: request.channelId,
    token: headerOf(request.headers, 'x-goog-channel-token'),
    resourceId: headerOf(request.headers, 'x-goog-resource-id'),
    state: headerOf(request.headers, 'x-goog-resource-state'),
  });
  if (outcome === 'rejected') {
    throw new ApiError('forbidden', 'This Google push channel is not known here.');
  }
}

async function linking<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof GoogleLinkError) throw LINK_REFUSALS[cause.failure]();
    throw cause;
  }
}

function requestOf(
  products: readonly { readonly product: GoogleProduct; readonly readOnly: boolean }[],
): GoogleRequest {
  const request: Partial<Record<GoogleProduct, GoogleAccessLevel>> = {};
  for (const { product, readOnly } of products) request[product] = readOnly ? 'read' : 'write';
  return request;
}

function startRoute(context: GoogleContext, google: GoogleServices): RouteOf<'googleLinkStart'> {
  return bound(E.googleLinkStart, ({ query, body, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    return linking(() => {
      const started = google.link.begin({
        profileId,
        client: body.platform,
        redirectUri: body.redirectUri,
        request: requestOf(body.products),
      });
      return { authUrl: started.authorizationUrl, state: started.state };
    });
  });
}

function finishRoute(context: GoogleContext, google: GoogleServices): RouteOf<'googleLinkFinish'> {
  return bound(E.googleLinkFinish, ({ query, body, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    return linking(async () => {
      const row = await google.link.complete({ profileId, ...body });
      if (row.status === 'linked') {
        background(google.runner.sync(profileId, 'link'), 'google.sync_failed', { profileId });
      }
      return row;
    });
  });
}

function unlinkRoute(context: GoogleContext, google: GoogleServices): RouteOf<'googleUnlink'> {
  return bound(E.googleUnlink, async ({ query, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    await google.channels.release(profileId);
    await google.link.unlink(profileId);
    google.runner.forget(profileId);
    return DONE_REPLY;
  });
}

function syncRoute(context: GoogleContext, google: GoogleServices): RouteOf<'googleSync'> {
  return bound(E.googleSync, async ({ query, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    const outcome = await google.runner.sync(profileId, 'manual');
    if (outcome === 'unlinked') {
      throw new ApiError('conflict', 'Link a Google account first.');
    }
    if (outcome === 'backoff') {
      throw new ApiError('rate_limited', 'Google asked for a pause. The sync resumes by itself.');
    }
    if (outcome === 'failed') {
      const reason = context.store.googleAccounts.find(profileId)?.last_error ?? 'unknown';
      throw new ApiError('upstream_failed', `The Google sync failed: ${reason}.`);
    }
    return DONE_REPLY;
  });
}

function logRoute(context: GoogleContext): RouteOf<'googleSyncLog'> {
  return bound(E.googleSyncLog, ({ query, caller }): GoogleSyncLogEntry[] => {
    const { before } = query;
    const entries = context.store.googleSyncLog.list(
      plannerProfileOf(context, caller, query.personId),
    );
    return before === undefined
      ? entries
      : entries.filter((entry) => Date.parse(entry.at) < Date.parse(before));
  });
}

function appRoute(context: GoogleContext): RouteOf<'googleApp'> {
  return bound(E.googleApp, async ({ body }) => {
    await context.secrets.saveGoogleApp({
      desktop: { clientId: body.desktopClientId, clientSecret: body.desktopClientSecret },
      android: { clientId: body.androidClientId },
    });
    return DONE_REPLY;
  });
}

function accountRoute(context: GoogleContext): RouteOf<'googleAccount'> {
  return bound(E.googleAccount, ({ query, body, caller }) => {
    const patch: GoogleAccountPatch = {
      ...(body.calendar_ids === undefined ? {} : { calendar_ids: body.calendar_ids }),
      ...(body.list_ids === undefined ? {} : { list_ids: body.list_ids }),
    };
    return context.store.googleAccounts.update(
      plannerProfileOf(context, caller, query.personId),
      patch,
    );
  });
}

function choiceRoute(context: GoogleContext, google: GoogleServices): RouteOf<'googleChoice'> {
  return bound(E.googleChoice, async ({ query, body, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    const { choice } = context.store.googleSyncLog.byId(body.logId, profileId);
    if (choice === null) {
      throw new ApiError('conflict', 'This log entry has no choice to make.');
    }
    if (choice.resolved_google_id !== null) {
      throw new ApiError('conflict', 'This choice was already made.');
    }
    if (!choice.candidates.some((candidate) => candidate.google_id === body.googleId)) {
      throw new ApiError('invalid_request', 'That Google task is not one of the matches.');
    }
    await google.tasks.resolveChoice(profileId, body.logId, body.googleId);
    return context.store.googleSyncLog.byId(body.logId, profileId);
  });
}

function pushRoute(google: GoogleServices): RouteOf<'googlePush'> {
  return bound(E.googlePush, (input) => {
    const { headers } = PUSH_HEADERS.parse(input);
    receivePush(google.receiver, { channelId: input.params.channelId, headers });
    return DONE_REPLY;
  });
}

export const googleRoutes = (context: GoogleContext, google: GoogleServices) =>
  ({
    googleLinkStart: startRoute(context, google),
    googleLinkFinish: finishRoute(context, google),
    googleUnlink: unlinkRoute(context, google),
    googleSync: syncRoute(context, google),
    googleSyncLog: logRoute(context),
    googleApp: appRoute(context),
    googleAccount: accountRoute(context),
    googleChoice: choiceRoute(context, google),
    googlePush: pushRoute(google),
  }) as const;
