import { useState } from 'react';
import {
  SHELLY_PRESENCE_ACTION,
  type JsonValue,
  type ShellyPresenceDevice,
  type ShellyResources,
} from '@smarteverything/domain';
import { usePresenceOperation, type PresenceOperation } from './use-presence-operation';

export type WebhookRow = NonNullable<ShellyResources['webhooks']>['hooks'][number];
export interface WebhookValues {
  readonly event: string;
  readonly cid: string;
  readonly name: string;
  readonly enable: boolean;
  readonly urls: readonly string[];
  readonly condition: string;
  readonly repeat: string;
  readonly window: JsonValue;
  readonly ca: string | null;
}
export interface WebhookDraft {
  readonly value: WebhookValues;
  readonly change: (value: WebhookValues) => void;
  readonly error: string | null;
  readonly conflict: boolean;
  readonly save: () => void;
  readonly destinationsLocked: boolean;
  readonly replaceDestinations: () => void;
  readonly operation: PresenceOperation;
}
function webhookInitial(row: WebhookRow | null): WebhookValues {
  if (row === null)
    return {
      event: '',
      cid: '',
      name: '',
      enable: true,
      urls: [''],
      condition: '',
      repeat: '',
      window: [],
      ca: 'ca.pem',
    };
  return {
    event: row.event,
    cid: String(row.cid),
    name: row.name ?? '',
    enable: row.enable ?? true,
    urls: row.urls,
    condition: row.condition ?? '',
    repeat: row.repeat_period === undefined ? '' : String(row.repeat_period),
    window: row.active_between ?? [],
    ca: row.ssl_ca ?? null,
  };
}

export function useWebhookDraft(
  sensor: ShellyPresenceDevice,
  row: WebhookRow | null,
): WebhookDraft {
  const [value, change] = useState(webhookInitial(row));
  const [replacingDestinations, setReplacingDestinations] = useState(false);
  const destinationsLocked = row?.destinationsRedacted === true && !replacingDestinations;
  const [error, setError] = useState<string | null>(null);
  const [revision] = useState(sensor.resources?.webhooks?.rev ?? null);
  const operation = usePresenceOperation(sensor);
  const acceptedRevision = operation.resourceRevision ?? revision;
  const save = (): void => {
    const parsed = SHELLY_PRESENCE_ACTION.safeParse({
      action: row === null ? 'webhook_create' : 'webhook_update',
      ...(row === null ? {} : { id: row.id }),
      webhook: {
        event: value.event,
        cid: value.cid.trim() === '' ? undefined : Number(value.cid),
        name: value.name,
        enable: value.enable,
        ...(destinationsLocked ? {} : { urls: value.urls }),
        condition: value.condition === '' ? null : value.condition,
        ...(value.repeat === '' ? {} : { repeat_period: Number(value.repeat) }),
        active_between: value.window,
        ssl_ca: value.ca,
      },
      ...(acceptedRevision === null ? {} : { expectedRevision: acceptedRevision }),
    });
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setError(null);
    void operation.run(parsed.data);
  };
  return {
    value,
    change,
    destinationsLocked,
    replaceDestinations: (): void => {
      setReplacingDestinations(true);
      change({ ...value, urls: [''] });
    },
    error,
    conflict: acceptedRevision !== (sensor.resources?.webhooks?.rev ?? null),
    save,
    operation,
  };
}
