import { z } from 'zod';
import { ecbDecrypt, gcmDecrypt, md5, utf8Text } from './crypto';

export const DISCOVERY_PORTS = [6666, 6667] as const;

export const UDP_KEY = md5('yGAdlopoPVldABfn');

const JSON_OBJECT = /\{.*\}/s;

const PREFIX_55AA = 0x000055aa;

const PREFIX_6699 = 0x00006699;

const BROADCAST = z.object({
  gwId: z.string().min(1),
  ip: z.ipv4(),
  version: z.string().regex(/^3\.[1-5]$/),
  productKey: z.string().optional(),
});

export interface LanAnnouncement {
  readonly deviceId: string;
  readonly ip: string;
  readonly version: string;
}

export class LanAnnouncementError extends Error {
  override readonly name = 'LanAnnouncementError';

  constructor(readonly reason: string) {
    super(`A Tuya LAN broadcast could not be read: ${reason}.`);
  }
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function payload55aa(frame: Uint8Array): Uint8Array {
  const length = view(frame).getUint32(12);
  if (frame.length < 16 + length) {
    throw new LanAnnouncementError(`the frame declares ${String(length)} bytes but carries fewer`);
  }
  const body = frame.subarray(16, 16 + length - 8);
  const withoutReturnCode = view(body).getUint32(0) === 0 ? body.subarray(4) : body;
  if (withoutReturnCode[0] === 0x7b) {
    return withoutReturnCode;
  }
  return ecbDecrypt(UDP_KEY, withoutReturnCode);
}

function payload6699(frame: Uint8Array): Uint8Array {
  const length = view(frame).getUint32(14);
  if (frame.length < 18 + length) {
    throw new LanAnnouncementError(`the frame declares ${String(length)} bytes but carries fewer`);
  }
  const header = frame.subarray(4, 18);
  const nonce = frame.subarray(18, 30);
  const sealed = frame.subarray(30, 18 + length);
  return gcmDecrypt(UDP_KEY, nonce, sealed, header);
}

function jsonText(plain: Uint8Array): string {
  const text = utf8Text(plain);
  const found = JSON_OBJECT.exec(text);
  if (found === null) {
    throw new LanAnnouncementError('the decrypted payload holds no JSON object');
  }
  return found[0];
}

function plainPayload(frame: Uint8Array): Uint8Array {
  if (frame.length < 24) {
    throw new LanAnnouncementError(
      `a frame needs at least 24 bytes, received ${String(frame.length)}`,
    );
  }
  const prefix = view(frame).getUint32(0);
  if (prefix === PREFIX_55AA) {
    return payload55aa(frame);
  }
  if (prefix === PREFIX_6699) {
    return payload6699(frame);
  }
  throw new LanAnnouncementError(`the frame prefix ${prefix.toString(16)} is not a Tuya prefix`);
}

export function readLanAnnouncement(frame: Uint8Array): LanAnnouncement {
  let candidate: unknown;
  try {
    candidate = JSON.parse(jsonText(plainPayload(frame)));
  } catch (error) {
    if (error instanceof LanAnnouncementError) {
      throw error;
    }
    throw new LanAnnouncementError(
      `its payload could not be decrypted or parsed (${String(error)})`,
    );
  }
  const parsed = BROADCAST.safeParse(candidate);
  if (!parsed.success) {
    throw new LanAnnouncementError(z.prettifyError(parsed.error));
  }
  return { deviceId: parsed.data.gwId, ip: parsed.data.ip, version: parsed.data.version };
}
