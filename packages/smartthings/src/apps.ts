import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parsed } from './errors';
import { OAUTH_SCOPES } from './oauth';
import { LINKS } from './rest-schemas';

const APP_NAME_PREFIX = 'smarteverything-';

const DISPLAY_NAME = 'SmartEverything';

export interface AppTargets {
  readonly webhookUrl: string;
  readonly redirectUri: string;
}

const ID = z.string().min(1);

const TARGET_STATUSES = ['PENDING', 'CONFIRMED'] as const;

const APP = z.object({
  appId: ID,
  appName: ID,
  apiOnly: z
    .object({
      subscription: z
        .object({ targetUrl: z.string(), targetStatus: z.enum(TARGET_STATUSES) })
        .nullish(),
    })
    .nullish(),
});

export type SmartThingsApp = z.infer<typeof APP>;

const APP_LIST = z.object({
  items: z.array(z.object({ appId: ID, appName: ID })),
  _links: LINKS,
});

const OAUTH_CLIENT = z.object({ oauthClientId: ID, oauthClientSecret: ID });

export interface AppCredentials {
  readonly appId: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export function appNameFor(webhookUrl: string): string {
  return `${APP_NAME_PREFIX}${createHash('sha256').update(webhookUrl).digest('hex').slice(0, 24)}`;
}

export function oauthUpdateBody(targets: AppTargets): Readonly<Record<string, unknown>> {
  return {
    clientName: DISPLAY_NAME,
    scope: [...OAUTH_SCOPES],
    redirectUris: [targets.redirectUri],
  };
}

export function appUpdateBody(
  targets: AppTargets,
  appName: string,
): Readonly<Record<string, unknown>> {
  return {
    appName,
    appType: 'API_ONLY',
    classifications: ['CONNECTED_SERVICE'],
    displayName: DISPLAY_NAME,
    description: `Connects SmartThings to SmartEverything at ${new URL(targets.webhookUrl).host}.`,
    singleInstance: true,
    apiOnly: { targetUrl: targets.webhookUrl },
  };
}

export function appCreateBody(targets: AppTargets): Readonly<Record<string, unknown>> {
  return {
    ...appUpdateBody(targets, appNameFor(targets.webhookUrl)),
    principalType: 'LOCATION',
    oauth: oauthUpdateBody(targets),
  };
}

export function oauthGenerateBody(): Readonly<Record<string, unknown>> {
  return { clientName: DISPLAY_NAME, scope: [...OAUTH_SCOPES] };
}

export type AppList = z.infer<typeof APP_LIST>;

export function readAppList(received: unknown): AppList {
  return parsed(APP_LIST, received, 'app list');
}

export function readApp(received: unknown): SmartThingsApp {
  return parsed(APP, received, 'app');
}

export function readAppCreation(received: unknown): {
  readonly app: SmartThingsApp;
  readonly credentials: AppCredentials;
} {
  const creation = parsed(OAUTH_CLIENT.extend({ app: APP }), received, 'app creation');
  return {
    app: creation.app,
    credentials: {
      appId: creation.app.appId,
      clientId: creation.oauthClientId,
      clientSecret: creation.oauthClientSecret,
    },
  };
}

export function readOAuthGeneration(received: unknown, appId: string): AppCredentials {
  const generation = parsed(OAUTH_CLIENT, received, 'OAuth client generation');
  return {
    appId,
    clientId: generation.oauthClientId,
    clientSecret: generation.oauthClientSecret,
  };
}

export function isTargetConfirmed(app: SmartThingsApp, webhookUrl: string): boolean {
  const subscription = app.apiOnly?.subscription;
  return subscription?.targetStatus === 'CONFIRMED' && subscription.targetUrl === webhookUrl;
}
