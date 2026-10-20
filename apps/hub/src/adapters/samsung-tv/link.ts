import { MAC_ADDRESS, type JsonValue, type ProviderCredentials } from '@smarteverything/domain';
import {
  deviceInfoUrl,
  readDeviceInfo,
  remoteUrl,
  type TvInfo,
} from '@smarteverything/smartthings';
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
  macAddress: MAC_ADDRESS,
  name: z.string().min(1),
  model: z.string().min(1),
  token: z.string().min(1),
  frame: z.boolean(),
  attachedTo: z.uuid().optional(),
});

export type TvAccount = z.infer<typeof TV_ACCOUNT>;

const TV_ACCOUNTS = z.object({ televisions: z.array(TV_ACCOUNT) });

export interface DirectLink {
  readonly deviceId: string;
  readonly host: string;
  readonly macAddress: string;
}

function secretsOf(account: TvAccount): Record<string, JsonValue> {
  const { attachedTo, ...rest } = account;
  return attachedTo === undefined ? rest : { ...rest, attachedTo };
}

export function televisionsOf(account: StoredAccount | null | undefined): readonly TvAccount[] {
  return account === undefined || account === null
    ? []
    : TV_ACCOUNTS.parse(account.secrets).televisions;
}

export function televisionsAccount(televisions: readonly TvAccount[]): StoredAccount {
  return {
    label: televisions.map((television) => television.name).join(', '),
    secrets: { televisions: televisions.map(secretsOf) },
  };
}

export function directLinksOf(account: StoredAccount | null | undefined): readonly DirectLink[] {
  return televisionsOf(account).flatMap(({ attachedTo, host, macAddress }) =>
    attachedTo === undefined ? [] : [{ deviceId: attachedTo, host, macAddress }],
  );
}

export function withTelevision(
  televisions: readonly TvAccount[],
  added: TvAccount,
): readonly TvAccount[] {
  const screen = televisions.find((television) => television.macAddress === added.macAddress);
  const attachedTo = added.attachedTo ?? screen?.attachedTo;
  const others = televisions.filter(
    (television) =>
      television.macAddress !== added.macAddress &&
      (attachedTo === undefined || television.attachedTo !== attachedTo),
  );
  return [...others, { ...added, ...(attachedTo === undefined ? {} : { attachedTo }) }];
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

export async function readTvInfo(io: SamsungTvIo, host: string): Promise<TvInfo> {
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

type TvIdentity = Omit<TvAccount, 'token' | 'attachedTo'>;

function identityOf(host: string, info: TvInfo, name: string | undefined): TvIdentity {
  const mac = info.wifiMac === null ? null : MAC_ADDRESS.safeParse(info.wifiMac);
  if (mac?.success !== true) {
    throw new TvLinkError(host, 'the screen did not report its network (MAC) address');
  }
  if (info.model === null) {
    throw new TvLinkError(host, 'the screen did not report its model name');
  }
  return {
    host,
    macAddress: mac.data,
    name: name ?? info.name ?? info.model,
    model: info.model,
    frame: info.frame,
  };
}

async function acceptedToken(
  io: SamsungTvIo,
  identity: TvIdentity,
  context: LinkContext,
): Promise<string> {
  const { host } = identity;
  const socket = io.openSocket(remoteUrl(host, 'remote', REMOTE_APP_NAME, null));
  context.ask({ kind: 'accept_on_device', device: identity.name }).catch((cause: unknown) => {
    context.log.warn('prompt.failed', { reason: failureLine(cause) });
  });
  const connection = await TvConnection.open(socket, host, ACCEPT_TIMEOUT_MS, 'connected');
  connection.close();
  if (connection.token === null) {
    throw new TvLinkError(host, 'the TV accepted the connection but issued no token');
  }
  return connection.token;
}

export async function linkSamsungTv(
  credentials: Extract<ProviderCredentials, { provider: 'samsung_tv' }>,
  io: SamsungTvIo,
  context: LinkContext,
): Promise<StoredAccount> {
  const { host, name, attachTo } = credentials;
  const identity = identityOf(host, await readTvInfo(io, host), name);
  const token = await acceptedToken(io, identity, context);
  const added: TvAccount = {
    ...identity,
    token,
    ...(attachTo === undefined ? {} : { attachedTo: attachTo }),
  };
  const televisions = withTelevision(televisionsOf(context.stored), added);
  context.log.info('television.linked', {
    model: identity.model,
    frame: identity.frame,
    attached: added.attachedTo !== undefined,
    televisions: televisions.length,
  });
  return televisionsAccount(televisions);
}
