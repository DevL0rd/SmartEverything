import { z } from 'zod';
import { SamsungTvMessageError } from '../errors';

export type ArtMessage =
  | { readonly kind: 'art_mode'; readonly on: boolean; readonly requestId: string | null }
  | {
      readonly kind: 'art_failed';
      readonly requestId: string | null;
      readonly errorCode: string | null;
    }
  | { readonly kind: 'art_other'; readonly event: string; readonly requestId: string | null };

const ON_OFF = z.enum(['on', 'off']);

const ART_DATA = z.object({
  event: z.string().min(1),
  id: z.string().optional(),
  request_id: z.string().optional(),
  value: ON_OFF.optional(),
  status: ON_OFF.optional(),
  error_code: z.union([z.string(), z.number()]).optional(),
});

type ArtData = z.infer<typeof ART_DATA>;

function artAppRequest(id: string, request: Readonly<Record<string, string>>): string {
  return JSON.stringify({
    method: 'ms.channel.emit',
    params: {
      event: 'art_app_request',
      to: 'host',
      data: JSON.stringify({ ...request, id, request_id: id }),
    },
  });
}

export function artModeStatusRequest(id: string): string {
  return artAppRequest(id, { request: 'get_artmode_status' });
}

export function setArtModeRequest(id: string, on: boolean): string {
  return artAppRequest(id, { request: 'set_artmode_status', value: on ? 'on' : 'off' });
}

function parseArtData(data: unknown): ArtData {
  const text = z.string().safeParse(data);
  if (!text.success) {
    throw new SamsungTvMessageError(data, 'd2d_service_message data is not a JSON string');
  }
  let json: unknown;
  try {
    json = JSON.parse(text.data);
  } catch (cause) {
    throw new SamsungTvMessageError(data, `d2d_service_message data: ${String(cause)}`);
  }
  const parsed = ART_DATA.safeParse(json);
  if (!parsed.success) {
    throw new SamsungTvMessageError(json, `d2d_service_message data: ${parsed.error.message}`);
  }
  return parsed.data;
}

function reportedArtMode(data: ArtData): 'on' | 'off' | undefined {
  if (data.event === 'art_mode_changed') {
    if (data.status === undefined) {
      throw new SamsungTvMessageError(data, 'art_mode_changed without an on or off status');
    }
    return data.status;
  }
  return data.event.includes('artmode_status') ? (data.value ?? data.status) : undefined;
}

export function readArtData(data: unknown): ArtMessage {
  const parsed = parseArtData(data);
  const requestId = parsed.request_id ?? parsed.id ?? null;
  const reported = reportedArtMode(parsed);
  if (reported !== undefined) {
    return { kind: 'art_mode', on: reported === 'on', requestId };
  }
  if (parsed.event === 'error') {
    const code = parsed.error_code;
    return { kind: 'art_failed', requestId, errorCode: code === undefined ? null : String(code) };
  }
  return { kind: 'art_other', event: parsed.event, requestId };
}
