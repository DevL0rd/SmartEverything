import { z } from 'zod';
import {
  BODY_READING_PUSH_DATA,
  DEVICE_NOTICE_PUSH_DATA,
  EVENT_KINDS,
  MCP_CONSENT_PUSH_DATA,
  PROFILE_DETAILS_PUSH_DATA,
  type McpConsentPushData,
} from '@smarteverything/domain';

const PUSH_DATA = z.union([
  z.object({
    eventId: z.uuid(),
    kind: z.enum(EVENT_KINDS),
    deviceId: z.uuid().optional(),
  }),
  DEVICE_NOTICE_PUSH_DATA,
]);

export type PushTap = z.infer<typeof PUSH_DATA>;

export function pushTapOf(data: unknown): PushTap | null {
  const parsed = PUSH_DATA.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function consentTapOf(data: unknown): McpConsentPushData | null {
  const parsed = MCP_CONSENT_PUSH_DATA.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function isBodyReadingTap(data: unknown): boolean {
  return BODY_READING_PUSH_DATA.safeParse(data).success;
}

export function isProfileDetailsTap(data: unknown): boolean {
  return PROFILE_DETAILS_PUSH_DATA.safeParse(data).success;
}
