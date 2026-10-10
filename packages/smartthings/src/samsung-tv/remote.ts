import { z } from 'zod';
import { SamsungTvMessageError } from '../errors';
import { readArtData, type ArtMessage } from './art';

export const REMOTE_PORT = 8002;

export const TV_CHANNELS = {
  remote: 'samsung.remote.control',
  art: 'com.samsung.art-app',
} as const;

export type TvChannel = keyof typeof TV_CHANNELS;

export function remoteUrl(
  host: string,
  channel: TvChannel,
  appName: string,
  token: string | null,
): string {
  const query = new URLSearchParams({ name: Buffer.from(appName).toString('base64') });
  if (token !== null) {
    query.set('token', token);
  }
  return `wss://${host}:${String(REMOTE_PORT)}/api/v2/channels/${TV_CHANNELS[channel]}?${query.toString()}`;
}

export const KEY_COMMANDS = ['Click', 'Press', 'Release'] as const;

export type KeyCommand = (typeof KEY_COMMANDS)[number];

export function keyMessage(key: string, command: KeyCommand): string {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: { Cmd: command, DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  });
}

export const FRAME_POWER_HOLD_MS = 3000;

export type TvStep =
  | { readonly kind: 'send'; readonly message: string }
  | { readonly kind: 'wait'; readonly ms: number };

export function powerOffSteps(frame: boolean): readonly TvStep[] {
  if (!frame) {
    return [{ kind: 'send', message: keyMessage('KEY_POWER', 'Click') }];
  }
  return [
    { kind: 'send', message: keyMessage('KEY_POWER', 'Press') },
    { kind: 'wait', ms: FRAME_POWER_HOLD_MS },
    { kind: 'send', message: keyMessage('KEY_POWER', 'Release') },
  ];
}

export const LAUNCH_ACTIONS = ['DEEP_LINK', 'NATIVE_LAUNCH'] as const;

export type LaunchAction = (typeof LAUNCH_ACTIONS)[number];

const DEEP_LINK_APP_TYPE = 2;

export function launchActionOf(appType: number): LaunchAction {
  return appType === DEEP_LINK_APP_TYPE ? 'DEEP_LINK' : 'NATIVE_LAUNCH';
}

export function launchMessage(appId: string, action: LaunchAction): string {
  return JSON.stringify({
    method: 'ms.channel.emit',
    params: {
      event: 'ed.apps.launch',
      to: 'host',
      data: { action_type: action, appId, metaTag: '' },
    },
  });
}

export function installedAppsMessage(): string {
  return JSON.stringify({
    method: 'ms.channel.emit',
    params: { event: 'ed.installedApp.get', to: 'host' },
  });
}

const INSTALLED_APP = z.object({
  appId: z.string().min(1),
  app_type: z.number().int(),
  name: z.string(),
});

export interface InstalledApp {
  readonly appId: string;
  readonly appType: number;
  readonly name: string;
}

export type TvMessage =
  | { readonly kind: 'connected'; readonly token: string | null }
  | { readonly kind: 'ready' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'timed_out' }
  | { readonly kind: 'installed_apps'; readonly apps: readonly InstalledApp[] }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'other'; readonly event: string }
  | ArtMessage;

const ENVELOPE = z.object({ event: z.string().min(1), data: z.unknown().optional() });

const CONNECT_DATA = z
  .object({ token: z.union([z.string().min(1), z.number()]).optional() })
  .nullish();

const INSTALLED_DATA = z.object({ data: z.array(INSTALLED_APP) });

const ERROR_DATA = z.object({ message: z.string() });

function parseData<T>(schema: z.ZodType<T>, envelope: z.infer<typeof ENVELOPE>): T {
  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) {
    throw new SamsungTvMessageError(envelope, `${envelope.event} data: ${parsed.error.message}`);
  }
  return parsed.data;
}

function parseEnvelope(text: string): z.infer<typeof ENVELOPE> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new SamsungTvMessageError(text, String(cause));
  }
  const parsed = ENVELOPE.safeParse(json);
  if (!parsed.success) {
    throw new SamsungTvMessageError(json, 'no event name');
  }
  return parsed.data;
}

export function readTvMessage(text: string): TvMessage {
  const envelope = parseEnvelope(text);
  switch (envelope.event) {
    case 'ms.channel.connect': {
      const token = parseData(CONNECT_DATA, envelope)?.token;
      return { kind: 'connected', token: token === undefined ? null : String(token) };
    }
    case 'ms.channel.ready':
      return { kind: 'ready' };
    case 'd2d_service_message':
      return readArtData(envelope.data);
    case 'ms.channel.unauthorized':
      return { kind: 'unauthorized' };
    case 'ms.channel.timeOut':
      return { kind: 'timed_out' };
    case 'ed.installedApp.get':
      return {
        kind: 'installed_apps',
        apps: parseData(INSTALLED_DATA, envelope).data.map((app) => ({
          appId: app.appId,
          appType: app.app_type,
          name: app.name,
        })),
      };
    case 'ms.error':
      return { kind: 'error', message: parseData(ERROR_DATA, envelope).message };
    default:
      return { kind: 'other', event: envelope.event };
  }
}
