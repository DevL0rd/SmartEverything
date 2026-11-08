import {
  signalFeeds,
  type JsonValue,
  type SignalInput,
  type SignalKindSpec,
} from '@smarteverything/domain';
import type { EventInsert } from '../database/port';
import type { SignalBus } from './bus';

export interface FeedRecorderOptions {
  readonly signals: Pick<SignalBus, 'subscribe' | 'specOf'>;
  readonly events: { readonly record: (event: EventInsert) => void };
}

function deviceWasRemoved(signal: SignalInput): boolean {
  return (
    signal.source === 'device' && signal.kind === 'lifecycle' && signal.data['change'] === 'removed'
  );
}

function rowDeviceId(signal: SignalInput, spec: SignalKindSpec): string | null {
  if (spec.subject !== 'device' || deviceWasRemoved(signal)) return null;
  return signal.subject;
}

export function feedRowOf(signal: SignalInput, spec: SignalKindSpec): EventInsert {
  const details: Record<string, JsonValue> = {
    source: signal.source,
    kind: signal.kind,
    field: signal.field,
    label: spec.label,
    subject: signal.subject,
    value: signal.value,
  };
  if (signal.profileId !== null) details['profileId'] = signal.profileId;
  if (spec.ownerOnly === true) details['ownerOnly'] = true;
  if (Object.keys(signal.data).length > 0) details['data'] = signal.data;
  return {
    deviceId: rowDeviceId(signal, spec),
    kind: 'signal',
    occurredAt: signal.at,
    details,
  };
}

export function recordFeedSignals(options: FeedRecorderOptions): () => void {
  return options.signals.subscribe((signal) => {
    const spec = options.signals.specOf(signal);
    if (spec !== undefined && signalFeeds(spec, signal)) {
      options.events.record(feedRowOf(signal, spec));
    }
  });
}
