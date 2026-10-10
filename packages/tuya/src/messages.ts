import { describeIssues } from './issues';
import { ecb, gcm } from '@noble/ciphers/aes.js';
import { md5 } from '@noble/hashes/legacy.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { TUYA_ENDPOINTS, type TuyaRegion } from './regions';

export const MESSAGE_TOPIC = 'event';

export const MESSAGE_ACK_TIMEOUT_MS = 3000;

const FRAME = z.object({
  messageId: z.string().min(1),
  payload: z.string(),
  properties: z.record(z.string(), z.string()).default({}),
});

const SOURCE = z.union([
  z.object({ encryptPayload: z.string().min(1) }).transform((source) => source.encryptPayload),
  z.object({ data: z.string().min(1) }).transform((source) => source.data),
]);

const STATUS_ITEM = z.object({ code: z.string().min(1), value: z.unknown() });

const BODY = z.object({
  devId: z.string().min(1).optional(),
  bizCode: z.string().optional(),
  status: z.array(STATUS_ITEM).optional(),
  bizData: z.object({ devId: z.string().min(1).optional() }).optional(),
});

export const INVENTORY_BIZ_CODES = ['bindUser', 'delete', 'nameUpdate'] as const;

export type CloudMessage =
  | {
      readonly kind: 'status';
      readonly deviceId: string;
      readonly items: readonly { readonly code: string; readonly value: unknown }[];
    }
  | {
      readonly kind: 'data_points';
      readonly deviceId: string;
      readonly dps: Readonly<Record<string, unknown>>;
    }
  | { readonly kind: 'online' | 'offline'; readonly deviceId: string }
  | { readonly kind: 'inventory_changed'; readonly deviceId: string; readonly bizCode: string }
  | { readonly kind: 'other'; readonly bizCode: string };

export function businessMessage(bizCode: string, deviceId: string | undefined): CloudMessage {
  if (deviceId === undefined) {
    return { kind: 'other', bizCode };
  }
  if (bizCode === 'online' || bizCode === 'offline') {
    return { kind: bizCode, deviceId };
  }
  return INVENTORY_BIZ_CODES.some((code) => code === bizCode)
    ? { kind: 'inventory_changed', deviceId, bizCode }
    : { kind: 'other', bizCode };
}

export interface MessageFrame {
  readonly messageId: string;
  readonly message: CloudMessage;
}

export class CloudMessageError extends Error {
  override readonly name = 'CloudMessageError';

  constructor(
    readonly reason: string,
    readonly messageId: string | null,
  ) {
    super(`A Tuya cloud message could not be read: ${reason}.`);
  }
}

function md5Hex(text: string): string {
  return bytesToHex(md5(utf8ToBytes(text)));
}

export function messagePassword(accessId: string, accessSecret: string): string {
  return md5Hex(`${accessId}${md5Hex(accessSecret)}`).slice(8, 24);
}

export function messageConsumerUrl(region: TuyaRegion, accessId: string): string {
  const query = `ackTimeoutMillis=${String(MESSAGE_ACK_TIMEOUT_MS)}&subscriptionType=Failover`;
  return `${TUYA_ENDPOINTS[region].messages}ws/v2/consumer/persistent/${accessId}/out/${MESSAGE_TOPIC}/${accessId}-sub?${query}`;
}

export function acknowledgement(messageId: string): string {
  return JSON.stringify({ messageId });
}

function jsonOf(text: string, what: string, messageId: string | null): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new CloudMessageError(`the ${what} is not JSON (${String(cause)})`, messageId);
  }
}

function fitted<S extends z.ZodType>(
  schema: S,
  candidate: unknown,
  what: string,
  messageId: string | null,
): z.output<S> {
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    throw new CloudMessageError(
      `the ${what} does not fit: ${describeIssues(parsed.error)}`,
      messageId,
    );
  }
  return parsed.data;
}

interface Sealed {
  readonly data: string;
  readonly mode: string | undefined;
}

function decrypted(sealed: Sealed, accessSecret: string, messageId: string): string {
  const key = utf8ToBytes(accessSecret.slice(8, 24));
  try {
    const bytes = Uint8Array.fromBase64(sealed.data);
    const plain =
      sealed.mode === 'aes_gcm'
        ? gcm(key, bytes.subarray(0, 12)).decrypt(bytes.subarray(12))
        : ecb(key).decrypt(bytes);
    return new TextDecoder('utf-8', { fatal: true }).decode(plain);
  } catch (cause) {
    throw new CloudMessageError(`its data could not be decrypted (${String(cause)})`, messageId);
  }
}

function messageOf(body: z.output<typeof BODY>): CloudMessage {
  const deviceId = body.devId ?? body.bizData?.devId;
  if (body.status !== undefined && deviceId !== undefined) {
    return { kind: 'status', deviceId, items: body.status };
  }
  return businessMessage(body.bizCode ?? 'none', deviceId);
}

function payloadText(payload: string, messageId: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.fromBase64(payload));
  } catch (cause) {
    throw new CloudMessageError(`its payload is not base64 text (${String(cause)})`, messageId);
  }
}

const FRAME_ID = z.object({ messageId: z.string().min(1) });

export function readMessageFrame(frame: string, accessSecret: string): MessageFrame {
  const candidate = jsonOf(frame, 'frame', null);
  const identified = FRAME_ID.safeParse(candidate);
  const messageId = identified.success ? identified.data.messageId : null;
  const outer = fitted(FRAME, candidate, 'frame', messageId);
  const source = jsonOf(payloadText(outer.payload, outer.messageId), 'payload', outer.messageId);
  const data = fitted(SOURCE, source, 'payload', outer.messageId);
  const plain = decrypted({ data, mode: outer.properties['em'] }, accessSecret, outer.messageId);
  const body = fitted(
    BODY,
    jsonOf(plain, 'message body', outer.messageId),
    'message body',
    outer.messageId,
  );
  return { messageId: outer.messageId, message: messageOf(body) };
}
