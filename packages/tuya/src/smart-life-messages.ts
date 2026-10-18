import { z } from 'zod';
import { fit, readJson } from './json';
import { CloudMessageError, businessMessage, type CloudMessage } from './messages';
import type { SmartLifeMessaging } from './smart-life-api';

const DEVICE_REPORT_PROTOCOL = 4;

const BUSINESS_PROTOCOL = 20;

const DATA_POINT_TOPIC_SUFFIX = '/pen';

const STATUS_TOPIC_SUFFIX = '/sta';

const CODE_ITEM = z.object({ code: z.string().min(1), value: z.unknown() });

const DATA_POINT_ITEM = z.object({ dpId: z.number().int().nonnegative(), value: z.unknown() });

const REPORT = z.object({
  protocol: z.literal(DEVICE_REPORT_PROTOCOL),
  data: z.object({
    devId: z.string().min(1),
    status: z.array(z.union([CODE_ITEM, DATA_POINT_ITEM])),
  }),
});

const BUSINESS = z.object({
  protocol: z.literal(BUSINESS_PROTOCOL),
  data: z.object({
    bizCode: z.string().min(1),
    bizData: z.object({ devId: z.string().min(1).optional() }).optional(),
  }),
});

function reject(reason: string): CloudMessageError {
  return new CloudMessageError(reason, null);
}

const ENVELOPE = z.object({ protocol: z.number().int() });

function reportMessages(report: z.output<typeof REPORT>): readonly CloudMessage[] {
  const deviceId = report.data.devId;
  const items: { code: string; value: unknown }[] = [];
  const dps: Record<string, unknown> = {};
  for (const item of report.data.status) {
    if ('code' in item) {
      items.push({ code: item.code, value: item.value });
    } else {
      dps[String(item.dpId)] = item.value;
    }
  }
  const messages: CloudMessage[] = [];
  if (items.length > 0) {
    messages.push({ kind: 'status', deviceId, items });
  }
  if (Object.keys(dps).length > 0) {
    messages.push({ kind: 'data_points', deviceId, dps });
  }
  return messages;
}

export function readSmartLifeMessage(payload: string): readonly CloudMessage[] {
  const candidate = readJson(payload, 'MQTT payload', reject);
  const { protocol } = fit(ENVELOPE, candidate, 'MQTT payload', reject);
  if (protocol === DEVICE_REPORT_PROTOCOL) {
    return reportMessages(fit(REPORT, candidate, 'MQTT payload', reject));
  }
  if (protocol === BUSINESS_PROTOCOL) {
    const { data } = fit(BUSINESS, candidate, 'MQTT payload', reject);
    return [businessMessage(data.bizCode, data.bizData?.devId)];
  }
  return [{ kind: 'other', bizCode: `protocol ${String(protocol)}` }];
}

export function ownerTopic(messaging: SmartLifeMessaging, ownerId: string): string {
  return messaging.topic.ownerId.sub.replace('{ownerId}', ownerId);
}

export function deviceTopic(
  messaging: SmartLifeMessaging,
  deviceId: string,
  reportsDataPoints: boolean,
): string {
  const suffix = reportsDataPoints ? DATA_POINT_TOPIC_SUFFIX : STATUS_TOPIC_SUFFIX;
  return `${messaging.topic.devId.sub.replace('{devId}', deviceId)}${suffix}`;
}
