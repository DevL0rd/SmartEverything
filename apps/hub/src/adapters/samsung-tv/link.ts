import type { JsonValue, ProviderCredentials } from '@smarteverything/domain';
import { deviceInfoUrl, readDeviceInfo, remoteUrl } from '@smarteverything/smartthings';
import { z } from 'zod';
import type { LinkContext, StoredAccount } from '../contract';
import { TvConnection, TvConnectionError } from './connection';
import type { SamsungTvIo } from './io';
import { failureLine } from '@smarteverything/logging';

export const REMOTE_APP_NAME = 'SmartEverything';

const ACCEPT_TIMEOUT_MS = 60_000;

const REST_TIMEOUT_MS = 3000;

export const TV_ACCOUNT = z.object({
  host: z.string().min(1),
  macAddress: z.string().min(1),
  name: z.string().min(1),
  model: z.string().min(1),
  token: z.string().min(1),
  frame: z.boolean(),
  attachedTo: z.uuid().optional(),
});

export type TvAccount = z.infer<typeof TV_ACCOUNT>;

export function accountSecrets(account: TvAccount): Record<string, JsonValue> {
  const { attachedTo, ...rest } = account;
  return attachedTo === undefined ? rest : { ...rest, attachedTo };
}

export function attachedDeviceOf(account: StoredAccount | null | undefined): string | null {
  return account === undefined || account === null
    ? null
    : (TV_ACCOUNT.parse(account.secrets).attachedTo ?? null);
}

export class TvLinkError extends Error {
  override readonly name = 'TvLinkError';

  constructor(
    readonly host: string,
    readonly reason: string,
  ) {
    super(`Linking the Samsung TV at ${host} failed: ${reason}.`);
  }
}

export async function readTvInfo(
  io: SamsungTvIo,
  host: string,
): Promise<ReturnType<typeof readDeviceInfo>> {
  let response: Response;
  try {
    response = await io.fetch(deviceInfoUrl(host), {
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new TvConnectionError(
      host,
      `the device information did not answer: ${failureLine(cause)}`,
    );
  }
  if (!response.ok) {
    throw new TvConnectionError(
      host,
      `the device information answered HTTP ${String(response.status)}`,
    );
  }
  return readDeviceInfo(await response.json());
}

export async function linkSamsungTv(
  credentials: Extract<ProviderCredentials, { provider: 'samsung_tv' }>,
  io: SamsungTvIo,
  context: LinkContext,
): Promise<StoredAccount> {
  const { host, macAddress, name, attachTo } = credentials;
  const info = await readTvInfo(io, host);
  const socket = io.openSocket(remoteUrl(host, 'remote', REMOTE_APP_NAME, null));
  context.ask({ kind: 'accept_on_device', device: name }).catch((cause: unknown) => {
    context.log.warn('prompt.failed', { reason: failureLine(cause) });
  });
  const connection = await TvConnection.open(socket, host, ACCEPT_TIMEOUT_MS, 'connected');
  connection.close();
  if (connection.token === null) {
    throw new TvLinkError(host, 'the TV accepted the connection but issued no token');
  }
  if (info.model === null) {
    throw new TvLinkError(host, 'the TV did not report its model name');
  }
  const account: TvAccount = {
    host,
    macAddress,
    name,
    model: info.model,
    token: connection.token,
    frame: info.frame,
    ...(attachTo === undefined ? {} : { attachedTo: attachTo }),
  };
  context.log.info('television.linked', { host, model: info.model, frame: info.frame });
  return { label: name, secrets: accountSecrets(account) };
}
