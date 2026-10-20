import {
  ApiError,
  SPEECH_TRIGGER,
  type AutomationRowV3,
  type AutomationV3,
  type JsonValue,
  type SpeechTrigger,
} from '@smarteverything/domain';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import { speechPrincipal } from '../transcripts/speech-principal';
import { admitSpeechSources } from '../transcripts/speech-readers';

const SPEECH_KIND = 'trigger.speech';
const DEVICE_SOURCES = ['camera', 'phone', 'computer'] as const;

type Record_ = Readonly<Record<string, JsonValue>>;

function isRecord(value: JsonValue | undefined): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordOf(value: JsonValue | undefined): Record_ | undefined {
  return isRecord(value) ? value : undefined;
}

function speechSource(record: Record_ | undefined): unknown {
  if (record === undefined) return null;
  const device = DEVICE_SOURCES.find((kind) => typeof record[kind] === 'string');
  if (device !== undefined) return { kind: device, deviceId: record[device] };
  if (typeof record['chat'] === 'string') return { kind: 'attachment', chatId: record['chat'] };
  return { kind: 'plugin', pluginId: record['plugin'], sourceId: record['sourceId'] };
}

function literalPort(
  trigger: AutomationV3['triggers'][number],
  port: string,
): JsonValue | undefined {
  const value = trigger.ports[port];
  if (value === undefined) return undefined;
  if (!('lit' in value)) {
    throw new ApiError(
      'invalid_request',
      `The speech trigger's ${port} must be typed in, not wired.`,
    );
  }
  return value.lit;
}

function speechTriggersOf(program: AutomationV3): readonly SpeechTrigger[] {
  return program.triggers
    .filter((trigger) => trigger.kind === SPEECH_KIND)
    .map((trigger) => {
      const parsed = SPEECH_TRIGGER.safeParse({
        type: 'speech',
        phrase: literalPort(trigger, 'phrase'),
        caseSensitive: literalPort(trigger, 'caseSensitive') ?? false,
        includeBots: literalPort(trigger, 'includeBots') ?? false,
        source: speechSource(recordOf(literalPort(trigger, 'source'))),
      });
      if (!parsed.success) {
        throw new ApiError(
          'invalid_request',
          `The speech trigger is not valid: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    });
}

export function authorSpeech(store: Store, caller: Caller, row: AutomationRowV3): void {
  const triggers = speechTriggersOf(row.definition);
  const prior = store.speech.grant(row.id);
  if (triggers.length === 0 && prior === undefined) return;
  const principal = speechPrincipal(store, caller);
  if (
    prior !== undefined &&
    (prior.principal.profileId !== principal.profileId || prior.principal.role !== principal.role)
  ) {
    throw new ApiError(
      'forbidden',
      'Only the initiating profile may change or reauthorize this speech automation.',
    );
  }
  if (triggers.length === 0) store.speech.remove(row.id);
  else
    store.speech.save(row.id, String(row.revision), admitSpeechSources(store, principal, triggers));
}
