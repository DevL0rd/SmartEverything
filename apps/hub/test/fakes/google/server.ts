import { AccountRegistry, type GoogleAccount } from './account';
import { channelRoutes } from './channel-routes';
import { ChannelHub, type PushNotification } from './channels';
import { createClock, type FakeClock } from './clock';
import { calendarRoutes } from './calendar-routes';
import { createFetch, type RecordedRequest } from './dispatch';
import { FaultInjector } from './faults';
import { OAuthServer } from './oauth';
import { TOKEN_HOST, USERINFO_HOST, publicRoute, type Route } from './route';
import { tasksRoutes } from './tasks-routes';
import type { FetchLike } from '../../../src/plugins/builtin/fetch-like';

export type { RecordedRequest } from './dispatch';

export interface FakeGoogleOptions {
  readonly start?: Date;
  readonly clockStepMs?: number;
  readonly accessTokenSeconds?: number;
  readonly refreshTokenLifetimeMs?: number | null;
  readonly refreshTokensPerClient?: number;
  readonly codeLifetimeMs?: number;
  readonly maxChannelLifetimeMs?: number;
  readonly deliver?: (notification: PushNotification) => void | Promise<void>;
  readonly honourTasksIfMatch?: boolean;
  readonly tasksUpdatedMinInclusive?: boolean;
}

export interface FakeGoogle {
  readonly fetch: FetchLike;
  readonly clock: FakeClock;
  readonly oauth: OAuthServer;
  readonly channels: ChannelHub;
  readonly faults: FaultInjector;
  readonly requests: RecordedRequest[];
  account(email: string): GoogleAccount;
}

const DEFAULT_START = new Date('2026-11-08T00:00:00.000Z');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function oauthRoutes(oauth: OAuthServer): readonly Route[] {
  return [
    publicRoute({
      host: TOKEN_HOST,
      method: 'POST',
      pattern: /^\/token$/,
      auth: null,
      handle: (context) => oauth.handleToken(context),
    }),
    publicRoute({
      host: TOKEN_HOST,
      method: 'POST',
      pattern: /^\/revoke$/,
      auth: null,
      handle: (context) => oauth.handleRevoke(context),
    }),
    publicRoute({
      host: USERINFO_HOST,
      method: 'GET',
      pattern: /^\/v1\/userinfo$/,
      auth: null,
      handle: (context) => oauth.userinfo(context.headers),
    }),
  ];
}

function buildOAuth(options: FakeGoogleOptions, clock: FakeClock): OAuthServer {
  return new OAuthServer({
    clock,
    accessTokenSeconds: options.accessTokenSeconds ?? 3599,
    refreshTokenLifetimeMs: options.refreshTokenLifetimeMs ?? null,
    refreshTokensPerClient: options.refreshTokensPerClient ?? 100,
    codeLifetimeMs: options.codeLifetimeMs ?? 600_000,
  });
}

function buildAccounts(
  options: FakeGoogleOptions,
  clock: FakeClock,
  channels: ChannelHub,
): AccountRegistry {
  let serverIds = 0;
  return new AccountRegistry({
    clock,
    nextServerId: (): number => (serverIds += 1),
    notify: (email, target): void => {
      channels.notify(email, target);
    },
    honourTasksIfMatch: options.honourTasksIfMatch ?? true,
    tasksUpdatedMinInclusive: options.tasksUpdatedMinInclusive ?? true,
  });
}

export function createFakeGoogle(options: FakeGoogleOptions = {}): FakeGoogle {
  const clock = createClock(options.start ?? DEFAULT_START, options.clockStepMs ?? 1);
  const oauth = buildOAuth(options, clock);
  const channels = new ChannelHub({
    clock,
    maxLifetimeMs: options.maxChannelLifetimeMs ?? WEEK_MS,
    deliver: options.deliver ?? null,
  });
  const accounts = buildAccounts(options, clock, channels);
  const faults = new FaultInjector();
  const requests: RecordedRequest[] = [];
  const routes = [
    ...oauthRoutes(oauth),
    ...channelRoutes(channels),
    ...calendarRoutes(clock),
    ...tasksRoutes(),
  ];
  return {
    fetch: createFetch({ routes, oauth, accounts, faults, requests }),
    clock,
    oauth,
    channels,
    faults,
    requests,
    account: (email) => accounts.forEmail(email),
  };
}
